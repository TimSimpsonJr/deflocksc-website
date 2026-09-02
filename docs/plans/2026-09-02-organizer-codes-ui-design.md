# Organizer codes — local admin UI — design

Date: 2026-09-02
Status: design (approved direction; revised 2026-09-02 after Sol security review round 1 — Host allowlist, both-loopback origins, no auto-open, idempotent revoke, canary-note parity, automated HTTP tests, honest remote-access deferral — and round 2 — `onCanary` callback so canary output survives a mid-operation failure, ports 80/443 rejected at startup)
Branch (proposed): `feature/organizer-codes-ui`

## Goal

A local, browser-based admin UI for organizer codes — `npm run codes:ui` — that reuses the existing CLI's exact minting logic to **issue** codes (with copy-to-clipboard), **list** existing codes, and **revoke** them. It writes to the same production Netlify Blobs the CLI does, using the maintainer's local `.env`. It is **never deployed**. Remote (phone/other-computer) access is **deferred** — not wired up in this iteration; the loopback Host/Origin guard blocks non-loopback access by design (see §5).

## Decisions (settled with the owner)

- **Local-first tool**, `npm run codes:ui`, bound to `127.0.0.1` only. Same trust model as the CLI (local machine + `.env`).
- **Full parity**: issue, list, revoke (revoke tombstones that code's events, behind a confirm step).
- **Reuse, don't reimplement**: factor the CLI's issue/list/revoke steps into ONE shared module so there is a single audited implementation of the credential logic (canary, wordlist checksum, collision check, `CONTEXT=production` guard). The UI gets structured data back — no parsing the CLI's stdout for a secret code.
- **Remote access = deferred** (Sol review round 1): a naive `tailscale serve` proxy does not work against the loopback Host/Origin guard (a MagicDNS-origin POST can never carry a loopback Origin), and Serve's identity headers mean nothing unless the app enforces them. The README documents the deferral honestly. Enabling remote access safely is a separate future task: an explicit MagicDNS Host+Origin allowlist plus enforcing a `Tailscale-User-Login` header (maintainer-only), with foreground `tailscale serve` (never `--bg`) and shutdown after use. Interim fallback: run the tool on the other machine with its own `.env`.
- Full treatment: this is credential-minting + a refactor of a security-sensitive file, so it goes through a plan + **Sol review** before implementation, built in an isolated worktree.

## Load-bearing facts (verified)

- The CLI is a **thin shell**, `scripts/organizer-codes.ts`: it loads `.env` (`process.loadEnvFile`), builds `NETLIFY_BLOBS_CONTEXT` from `parseEnv`, sets `CONTEXT=production` (the deliberate opt-in to write the shared prod stores), then runs `runIssue`/`runRevoke`/`runList`/`runSetIntake`. These functions do the I/O; **the presentation (stdout banners, clipboard, fold prompt) is interleaved with the core logic there.**
- Pure logic + record shapes + all output text live in `src/lib/organizer-cli.ts` (unit-tested): `parseCliArgs`, `buildCodeRecord`, `toListRow`, `revokeRecord`, `selectRevocationTarget`, `shouldTombstone`, `tombstoneEvent`, canary decisions, formatters, wordlist checksum/parse.
- Code generation: `generateCode(words, rng)` + `digestCode(normalized, pepper)` + `normalizeCode` in `src/lib/organizer-code.ts`. The plaintext code is shown once (`formatIssueBanner`) and **never stored** — only its HMAC `digest` is stored (`codesStore().setJSON(digest, buildCodeRecord(...))`).
- Stores: `codesStore`, `eventsStore`, `linksStore`, `metaStore` from `src/lib/blob-stores.ts`; writes refuse unless `CONTEXT==='production'` (`ContextRefusedError`).
- Revoke cascade: `runRevoke` selects the target code, writes `revokeRecord`, then scans `eventsStore` and tombstones every event where `shouldTombstone(event, digest)` (i.e. `event.codeDigest === digest`), then optionally triggers the fold workflow.
- **Invariants the CLI holds (must be preserved):** never write a plaintext code to a file; never log a code; never accept a code as an argument; never print a code during `list`; never print the intake URL during `list`; never commit anything.

## Design

### 1. Shared ops module (`src/lib/organizer-ops.ts`, impure, dependency-injected)

Extract the *core* of each operation from the CLI shell into functions that take injected dependencies and **return structured results** (no stdout, no clipboard). Dependencies are passed in so the module is unit-testable with fakes and has no ambient coupling:

```ts
interface OpsDeps {
  codes: Store; events: Store; meta: Store;   // from blob-stores
  pepper: string;
  wordlist: string[];                          // already read + checksum-verified by the caller-side reader
  now: () => string;                           // () => new Date().toISOString()
  rng: (maxExclusive: number) => number;       // randomInt
  onCanary: (note: string | null, warning: string | null) => void;
    // fired IMMEDIATELY after the canary check, BEFORE any generate/lookup/
    // write/sweep — the canary signal must survive a mid-operation failure
}

issueCode(deps, { pseudonym }): Promise<{ pseudonym: string; code: string }>
  // canary(strict) → onCanary → generate → collision → store; plaintext code IN MEMORY ONLY
listCodes(deps): Promise<ListRow[]>                                  // no codes, ever
revokeCode(deps, { pseudonym, digest }): Promise<
  | { kind: 'ok'; digest: string; tombstoned: number }
  | { kind: 'none' } | { kind: 'many'; rows: ListRow[] }>
  // canary(non-strict) → onCanary → select → revoke → tombstone cascade
```

`revokeCode` is **idempotent**: revoking an already-revoked code skips the record re-write but still runs the tombstone sweep over every remaining `codeDigest`-matching, non-tombstoned event. That is the recovery path for a cascade interrupted mid-flight (the record flips to revoked before the sweep, so a partial failure would otherwise strand events with no way to finish the takedown).

**Canary outcomes surface via `onCanary`, not the return value** (Sol round 2): both ops invoke the injected callback with the first-write note and/or the non-strict mismatch warning right after the canary check, before any fallible store/generate work — so a store failure mid-issue or mid-revoke cannot swallow the signal (on first use the canary has already been *written* by then; losing the note would hide that). The CLI's `onCanary` prints in today's channels and order (note → stdout, warning → stderr, before the operation's output); the server's records the values and echoes them in both success and error responses.

The wordlist read + checksum enforcement and the canary check stay part of the issue path (moved into the module or a shared helper both front-ends call) so **every front-end enforces them identically**. `CONTEXT=production` + `NETLIFY_BLOBS_CONTEXT` are still set by each front-end's bootstrap before the stores are built (unchanged from the CLI).

`scripts/organizer-codes.ts` is refactored to call these and keep ONLY its presentation (banners, `--clip`, the fold prompt). Its behavior — and its tests — stay identical.

### 2. Local server (`src/lib/codes-ui-server.ts` + thin entry `scripts/codes-ui.ts`)

The request handler is a **dependency-injected factory** (`createRequestHandler`) in `src/lib/codes-ui-server.ts`, so the entire security boundary is exercised by automated loopback HTTP tests with fake ops. `scripts/codes-ui.ts` is the thin bootstrap entry, bundled + run like the CLI (`esbuild` bundle; `process.loadEnvFile('.env')`; `parseEnv` → `NETLIFY_BLOBS_CONTEXT`; `CONTEXT=production`), that builds the real deps and listens. The server:

- **Binds `127.0.0.1` only** (never `0.0.0.0`), on a fixed port (4919) or an env-overridable one (`CODES_UI_PORT`, digits-only validated; **ports 80 and 443 are rejected at startup** — browsers omit the scheme-default port when serializing Host/Origin, which the exact `:<port>` allowlist requires, so a default port would 421/403 everything; this is a local dev tool and a non-default port is expected); prints the canonical `http://127.0.0.1:<port>` URL for the maintainer to click. It does **not** auto-open the browser: a spawned `cmd`/`open`/`xdg-open` child would inherit the process environment, which holds the pepper and the Netlify credentials.
- Enforces an exact, case-normalized **Host allowlist** — `127.0.0.1:<port>` and `localhost:<port>` only — on every request, page and API alike, answering anything else (including a missing Host) with **421** before serving a byte. This is the DNS-rebinding defense: a rebinding attacker resolves an attacker-controlled hostname to 127.0.0.1, and without the Host check could load `/`, read the embedded token, and make requests the origin checks consider same-origin.
- Serves the page at `/` and JSON endpoints: `POST /api/issue {pseudonym}`, `GET /api/list`, `POST /api/revoke {pseudonym, digest?}`.
- Each endpoint reads+validates the wordlist (issue), builds the deps, and calls the shared ops module; returns JSON (issue returns `{ pseudonym, code, canaryNote, canaryWarning }` — the code in the response body, localhost only). The handler records the `onCanary` values per request and echoes them in **both success and error responses**, so a store failure after the canary check still surfaces the note/warning to the page.
- Mints a **random per-run token** at startup, embeds it in the served page, and requires it as a header (`X-Codes-Token`) on every `/api/*` call; also rejects requests whose `Origin`/`Sec-Fetch-Site` is cross-site. **Both loopback origins** (`http://127.0.0.1:<port>` and `http://localhost:<port>`) are accepted — safe once Host + token are enforced, and it removes the hand-typed-`localhost` footgun. Together these stop a malicious site open in your browser from POSTing to `localhost/api/issue` (local CSRF). GET is limited to the page + safe reads guarded the same way. No CORS headers are ever emitted.
- Validates `pseudonym` with the CLI's `isValidPseudonym`; **refuses anything that looks like a code** (`looksLikeCode`) exactly as the CLI does.
- Answers an oversized request body with a delivered **413** (the remaining body is drained so the response can flush; the socket is not just destroyed).

### 3. The page

Served by the server (single self-contained HTML + a small inline script; deflock dark theme). Sections per the approved mockup:
- **Issue**: pseudonym input → *Issue code* → the returned code is shown **once** in a highlighted box with a **Copy** button (`navigator.clipboard` — localhost is a secure context) and the "shown once, can't be recovered" warning.
- **Plaintext lifecycle**: the code is held only in that DOM node; nothing persists it. It is cleared on Dismiss, on re-issue, and on navigation — a `pagehide` handler calls the dismiss path, and a bfcache `pageshow` restore (`event.persisted`) clears defensively, because `Cache-Control: no-store` does **not** prevent bfcache in current Chrome. Deliberately unavoidable residues, documented rather than pretended away: the fetch response object, DevTools memory, the DOM while the box is shown, and the clipboard after Copy (OS clipboard history/sync may retain it).
- **Existing codes**: a table from `/api/list` — pseudonym · issued · Active/Revoked, **never the codes**. Revoke button per active row; revoked rows keep a **Retry takedown** action that re-runs the revoke by digest, completing any tombstones an interrupted cascade left behind (backed by `revokeCode`'s idempotency, §1).
- **Revoke**: a **real confirmation dialog** that names the pseudonym and states that its events will be tombstoned — a second deliberate action (`window.confirm` or a dedicated modal), not a re-click of the same button, which a double-click would defeat → `POST /api/revoke` → shows how many events were tombstoned. The fold (publishing the takedown to static HTML) is surfaced as a note/optional trigger, mirroring the CLI's fold reminder — not run silently.

### 4. `npm run codes:ui`

A package.json script that bundles `scripts/codes-ui.ts` with esbuild and runs it (same pattern as `codes`). Loads `.env`; a missing pepper / Netlify credential is a hard error (no local-store fallback), exactly like the CLI.

### 5. Remote access (deferred; honest README note)

Remote access is **not wired up**, and the README says so instead of documenting a recipe that breaks or overstates its security. Two facts drive the deferral (Sol review round 1): a `tailscale serve` proxy would present a MagicDNS Host and HTTPS Origin that the loopback Host/Origin guard rejects by design — every POST would 403 — and Tailscale Serve's identity headers (`Tailscale-User-Login`) protect nothing unless the app checks them, which this app does not. Enabling remote access safely is a **separate future task**: an explicit MagicDNS Host+Origin allowlist, plus enforcing `Tailscale-User-Login` against the maintainer's identity, run with foreground `tailscale serve` (never `--bg`) and shut down after use. Until then, the fallback is running the tool on the other machine directly with its own `.env`.

## Files

- **New**: `src/lib/organizer-ops.ts` (shared issue/list/revoke core) + its test; `src/lib/codes-ui-guard.ts` (pure Host/token/origin decisions) + its test; `src/lib/codes-ui-server.ts` (dependency-injected request handler) + its loopback HTTP test; `scripts/codes-ui.ts` (thin bootstrap entry); the page `scripts/codes-ui.html`.
- **Modify**: `scripts/organizer-codes.ts` (call the shared ops, keep presentation only); `package.json` (`codes:ui` script); the README (maintainer section + remote-access deferral note).
- **Untouched**: `src/lib/organizer-cli.ts` (pure logic stays), `blob-stores.ts`, `organizer-code.ts`.

## Testing

- **Unit** (`organizer-ops.test.ts`, with fake in-memory Stores + a fixed rng/now): `issueCode` writes a record under the digest and returns a plaintext code that is NOT the digest and never persisted; collision path; canary enforcement (including the first-write note on issue AND on revoke, observed via `onCanary`). `revokeCode` ok/none/many + the tombstone cascade (only `codeDigest`-matching, non-tombstoned events) + idempotency (a second revoke of an already-revoked record completes the remaining tombstones without re-writing the record and touches no other digest). **Canary-survives-failure** (Sol round 2, with fake stores that throw on the relevant op): a revoke with a canary MISMATCH followed by a store failure still surfaces the warning; a FIRST-USE revoke whose store op then fails still surfaces the note (and the canary is already written); a first-use issue that then hits a collision still surfaces the note. `listCodes` returns rows with no code material.
- **CLI regression**: the existing organizer-codes CLI tests stay green after the refactor (behavior identical).
- **Guard unit tests** (`codes-ui-guard.test.ts`, pure): Host allowlist (both loopback hosts accepted, foreign/missing/wrong-port rejected, case-normalized) and token/Origin/Sec-Fetch-Site decisions (both loopback origins accepted; cross-site rejected before any token verdict).
- **Automated HTTP tests** (`codes-ui-server.test.ts`, real loopback server + `createRequestHandler` with injected fake ops): missing/unexpected Host → 421 before the token-bearing page is served (the foreign-Host case uses the server's real ephemeral port with a wrong *hostname*, isolating hostname rejection from port rejection); both approved loopback Hosts and Origins accepted; all three `/api` routes require the token; cross-site Origin and Sec-Fetch-Site rejected; OPTIONS returns no permissive CORS; invalid input (bad pseudonym / `looksLikeCode`) reaches no ops/store dependency; CSP + `Cache-Control: no-store` headers present; oversized body answered with a delivered 413; an op that fails *after* the canary check still gets its recorded canary values echoed in the error response.
- **Manual**: `npm run codes:ui` boots, binds loopback only (`netstat`), prints the URL (no auto-open); missing pepper is a hard error; page renders and clears the code on navigation/bfcache restore. Real issue/revoke stays a documented maintainer walkthrough — it writes production.

## Security review emphasis (for Sol / the review pass)

The refactor must not weaken any CLI invariant; the plaintext code must exist only in memory + the localhost HTTP response + the browser DOM (never a file/log), with the documented residues (fetch response, DevTools memory, clipboard after Copy) named rather than hidden; the localhost-CSRF guard must actually stop cross-site POSTs; the **Host allowlist must be enforced before anything is served** (DNS-rebinding defense — Origin checks alone do not stop a rebound hostname from reading the token page); **no child process may inherit the environment** (no browser auto-open — the env holds the pepper and Netlify credentials); accepting both loopback origins is safe only because Host + token are enforced; `CONTEXT=production` ordering (set before any store factory) must be preserved in the new server; the server must never bind beyond loopback; `revokeCode`'s idempotent re-run must be the recovery path for an interrupted cascade; the pepper-canary signal (first-write note, mismatch warning) must fire via `onCanary` before any fallible store work, so a mid-operation failure can never swallow it.

## Non-goals

No deployment, no authentication service, no `set-intake` in the UI (stays CLI), no changes to how codes are generated/validated or how events store `codeDigest`. Remote access is **deferred outright — neither built nor documented as workable**; a future task may enable it with an explicit MagicDNS Host+Origin allowlist plus `Tailscale-User-Login` enforcement (§5).
