# Events Calendar — Design

Status: approved design, not yet planned
Branch: `feature/events-calendar`
Date: 2026-08-17

## 1. Goal

Local organizers submit events to a public calendar on deflocksc.org. Visitors find events near them via a calendar list and an interactive map, then reach the organizer through a per-event Signal group. For organizing meetups, the venue is never published; it is shared inside the Signal group.

Two event types:

- **Meetup** (vetted): title, date, time, city. No address. Signal group link required.
- **Public event** (council meetings, public-facing actions): everything above plus a required address and an optional description. Signal link optional.

Submission is gated by a per-organizer code that Tim hand-issues after an out-of-band vetting conversation. A valid code publishes immediately with no human review.

## 2. Non-goals

- No admin web UI. Codes and revocations are managed by a local CLI script.
- No captcha. The current CSP blocks every third-party widget at both `script-src` and `frame-src`, and Turnstile degrades the VPN/Tor/hardened-browser profile this audience uses.
- No `.ics` export in v1.
- No per-event pages. The permalink is `/events#<id>`.
- No email notifications.
- No moderation queue. Auto-publish is the chosen model (see §16).

## 3. Decisions

| Area | Decision |
|---|---|
| Publish flow | Blobs store + client overlay, weekly fold into git |
| Moderation | Full auto-publish on a valid code |
| Code format | 4 words from the EFF short wordlist #2 (41.4 bits) |
| Code verification | HMAC-SHA256 with a server-side pepper; digest is the Blobs key |
| Code storage | Netlify Blobs, issued and revoked by local CLI, no deploy |
| Invalid code response | Explicit "invalid code", backed by rate limiting |
| Revocation | Per-code revoke, cascade tombstone of that code's events, manual fold trigger |
| Recurrence | Weekly or monthly-Nth-weekday, end date required, max 6 months, renewable |
| Past events | Remain listed; the redirect refuses to resolve their Signal link |
| Signal links | `/go/:eventId` function returning 200 + meta-refresh |
| Map | County choropleth + count badges below z8, city-centroid pins above |
| Desktop layout | Map left (sticky), list right |
| Mobile layout | Tabs: List / Month / Map |
| Empty state | Past-event count as social proof, plus email or gated Signal intake |

## 4. Architecture

```
Organizer ──POST /api/submit-event──> [validate · verify code · rate limit] ──> Blobs
                                                      └── returns id, organizer copies /events#<id>

Visitor ──> /events (baked HTML from git)
        ──> /api/events (overlay, CDN-cached 60s) ──> Blobs
        ──> /go/:eventId ──> Blobs ──> 200 + meta-refresh ──> signal.group

Weekly (Sun 04:00 UTC) ──> read Blobs ──> GitHub contents API ──> commit src/data/events.json
                                                                  └──> 1 Netlify deploy
```

The calendar renders from `src/data/events.json` at build time. The overlay adds events submitted since the last fold. Client merges by `id`, baked wins on conflict.

**Why both:** a runtime-only calendar costs zero deploys but leaves events out of git, breaks with JS off, and blanks the page during a store outage. A rebuild-per-submission calendar burns 15 credits per event and hands any code-holder a denial-of-wallet button. The weekly fold costs 4.3 deploys/month and gets the git trail, no-JS rendering, and graceful degradation.

## 5. Data model

### `src/data/events.json` (committed to git)

```jsonc
{
  "id": "k7m29qxb",              // 8-char base32, random, non-enumerable
  "type": "meetup" | "public",
  "title": "string, <= 80 chars",
  "description": "string, <= 300",  // public events only; null for meetups
  "date": "2026-08-22",
  "time": "19:00",                 // 24h
  "city": "greenville",            // allowlist key
  "county": "greenville",          // allowlist key
  "address": "301 University Ridge, Greenville",  // public events only; null for meetups
  "hasSignalGroup": true,          // boolean only
  "recurrence": null | { "freq": "weekly" | "monthly_nth", "until": "2027-02-22" },
  "organizer": "handle-jay",       // pseudonym, never a real name
  "createdAt": "2026-08-17T14:22:00Z"
}
```

**Absent by design:** no `signalUrl`, no `codeDigest`, no submitter IP, no email. Git history is permanent and effectively public; a Signal invite committed once is committed forever. Because links resolve through `/go/:id`, the URL never needs to be in the page, so it never needs to be in the commit.

**Present, and permanent:** `organizer` is a pseudonym, but it is committed to a public repo and therefore public forever. A pseudonym that recurs across events in one county, correlated with dates, is a pattern. Choose pseudonyms that carry no personal signal, and accept that the alternative (omitting attribution entirely) would leave no way to see at a glance which organizer a series belongs to.

Events are JSON, never markdown frontmatter or a content-collection body. This deletes the YAML-injection class outright rather than escaping around it, and matches the existing `bills.json` convention. Astro 5's `loader: file()` with a Zod schema gives build-time validation of the committed file for free.

### Reading events out: `toPublicEvent()`

**The `/api/events` response is built by an explicit allowlist projection, never by returning or spreading a stored record.** `toPublicEvent(record)` lives in `src/lib/` and emits exactly the `src/data/events.json` field set: `id`, `type`, `title`, `description`, `date`, `time`, `city`, `county`, `address`, `hasSignalGroup`, `recurrence`, `organizer`, `createdAt`. `signalUrl`, `codeDigest`, `revoked`, and anything added to the store later are denied by construction rather than by remembering to delete them. Tombstoned and expired events are omitted from the response entirely.

This is the single highest-consequence rule in the document. The obvious implementation — `store.list()`, return the blobs — publishes **every live Signal invite as machine-readable JSON, CDN-cached, to anyone who asks**, which reverses the entire `/go/:id` design in one line. `codeDigest` would additionally cluster events by organizer across pseudonyms, and `revoked` would become a public feed of which organizer was burned and when.

The projection shares its field list with the Zod schema so the two cannot drift. The repo already has this pattern: `ActionModal.astro` projects `registry.json` down to a field whitelist before serializing, with a comment about not leaking adapter config.

### Blobs stores

| Store | Key | Value |
|---|---|---|
| `events` | `<id>` | full record, plus `signalUrl`, `codeDigest`, `revoked` |
| `codes` | `<hmac-digest-hex>` | `{ pseudonym, issuedAt, revoked }` |
| `ratelimit` | `<yyyy-mm-dd>/<hashed-ip>` | attempt counter |

Use `getStore`, never `getDeployStore` — the latter scopes data to a single deploy and every event would silently vanish on the next push.

**That choice discards deploy isolation, so put it back deliberately.** Site-wide stores are shared across production, branch, and preview deploys: a preview deploy's functions can read `events` (with `signalUrl`), read `codes` (pseudonyms and issue dates), and delete from either. The `codes` store has no backup, so a delete there is the one unrecoverable case in the system.

All Blobs access goes through one store factory in `src/lib/` that reads `process.env.CONTEXT` and **refuses every write and delete when the context is not `production`**, returning a clear error rather than falling through. Keep an offline copy of the `codes` store via `organizer-codes.mjs list --json`. Confirm whether Netlify builds deploy previews for fork PRs; if it does, disable that.

**All Blobs keys are server-generated.** No key segment is ever derived from user input. This is what stops a future user-chosen slug from writing `codes/<digest>` or `meta/pepper-canary`.

## 6. Submission validation

Single Zod schema, shared between the function and the build-time check. Zod is not currently a dependency; adding it trips the machine-wide 30-day minimum-release-age gate, so pin a version at least 30 days old.

| Field | Rule |
|---|---|
| `type` | enum |
| `title` | 1–80 grapheme clusters after NFKC; full rules under Text sanitization below |
| `description` | `public` only, 1–300 grapheme clusters, same sanitization; rejected outright for `meetup` |
| `date` | ISO date, must be in the future, at most 12 months out |
| `time` | `HH:MM`, 24h |
| `city` | enum from the allowlist (`registry.json` places) |
| `county` | **derived from `city`, never submitted.** A place maps to one primary county; the form does not ask for it, and a submitted `county` is rejected rather than trusted |
| `address` | `public` only, required, ≤120 chars; rejected outright for `meetup` |
| `signalUrl` | required for `meetup`, optional for `public`; see below |
| `recurrence` | optional; `until` required when present, ≤6 months out |
| `organizerCode` | 4 words after normalization |

**City and county are enums, not free text.** This is the injection defense and it also guarantees every event has a map centroid (§11).

### Text sanitization

Escaping and sanitization are different jobs and neither substitutes for the other. Astro's escaping stops a title from becoming markup. It does nothing about a title that is perfectly valid text and still abusive. Two free-text fields survive into the published data (`title` on every event, `description` on public events), so both need this pass.

Two tiers here, and they carry different weight. **The byte caps, the reject-list, and the regex shape rules are attack-surface controls** — they bound compute, stop text that renders differently from how it is stored, and keep hostile input from reaching a backtracking regex. **The combining-mark cap, script restriction, and emoji ban are content-quality rules**; the worst case if they are wrong is an ugly calendar, not a compromise. Implement the first tier without negotiation and treat the second as adjustable.

**Cap raw bytes, then normalize, then measure graphemes, then validate.** Each step bounds the next. The byte cap bounds compute; the grapheme cap bounds display.

Before `req.json()`, reject the request if `Content-Length` is absent or exceeds **8192 bytes**, and read the body through a counting reader that aborts past 8192 so a chunked `Transfer-Encoding` cannot evade the header check. Reject any parse result that is not a plain JSON object — a bare `null`, number, string, or array is a 400, not a downstream `TypeError`. Then apply per-field raw byte caps **before NFKC**: `organizerCode` 128, `title` 1024, `description` 3072, `address` 512. NFKC can expand input (U+FDFA expands 18x), so a cap applied after normalization is not a cap on the work done to get there.

The submit pipeline runs **body cap → rate limit → validate → verify code**, so the cheap bounded checks come before any normalization or segmentation.

1. **NFKC normalize.** Folds compatibility variants, so fullwidth `ｇｒｅｅｎｖｉｌｌｅ` collapses to `greenville` and cannot masquerade as a distinct value.
2. **Trim, then collapse internal whitespace runs to a single space.** Reject any remaining newline or tab: these are single-line fields.
3. **Measure length in grapheme clusters**, via `Intl.Segmenter` with `granularity: 'grapheme'`. An 80-*code-unit* cap is not 80 visible characters, in either direction. Note that a grapheme cap does not bound code-point count either (`a` + 30 combining acutes + `!` is 2 graphemes and 32 code points), which is why the raw byte cap above is the one that actually bounds regex work.

**Reject, do not strip.** Stripping produces a string the submitter never wrote, and a filter that rewrites input can usually be used to smuggle something past it. Reject the whole submission with a clear message instead:

| Class | Code points | Why |
|---|---|---|
| C0 / C1 controls | `U+0000–U+001F`, `U+007F–U+009F` | No legitimate use in a title |
| Bidi overrides and isolates | `U+202A–U+202E`, `U+2066–U+2069` | Trojan Source: the rendered order differs from the stored order, so moderation and display disagree |
| Zero-width and BOM | `U+200B`, `U+200C`, `U+200D`, `U+FEFF` | Invisible; defeats the duplicate detection below and hides content from a reviewer |
| Unassigned and private use | `U+E000–U+F8FF`, planes 15–16, unassigned | Renders as tofu or as something only the attacker's font knows |

**Cap combining marks.** At most 2 consecutive marks in category `Mn`/`Mc`/`Me` per base character. Without this, one Zalgo title stacks diacritics vertically through the entire calendar. This is the layout-destroying attack, and CSS alone cannot fully contain it.

**Restrict to Latin and Common scripts.** This blocks homoglyph impersonation (Cyrillic `а` reading as Latin `a`, so a title can appear to name a city or organizer it does not) without shipping a full confusables table. **This is a deliberate exclusion and should be a conscious one:** it permits Spanish, which is the realistic second language for SC organizing, and rejects titles in Korean, Arabic, or Chinese. If that becomes wrong, replace the script restriction with UTS #39 confusable skeleton matching rather than simply widening it.

**No emoji in either field.** Allowing them means allowing ZWJ and variation selectors, which reopens the zero-width class above for the sake of decoration on a public listing.

**Validate on the way in and again at render.** Same rule as the Signal URL: the committed JSON lives in a repo a later bad commit can edit, and the build must not trust it.

**Defense in depth in CSS**, because sanitization should not be the only thing standing between a submission and the layout:

```css
.event-title {
  overflow-wrap: anywhere;      /* an 80-char unbroken run cannot widen the grid */
  unicode-bidi: isolate;        /* residual bidi cannot escape the element */
  max-height: 3lh;              /* stacked marks cannot grow the card unbounded */
  overflow: hidden;
}
```

**Duplicate detection runs on the normalized string**, never the raw body: one added space or zero-width character otherwise defeats it.

All of this lives in `src/lib/sanitize-text.ts` and is imported by the submit function, the build-time schema check, and the tests. One implementation, three callers, same reasoning as `normalizeCode()`.

### Signal URL validation

Parse with the WHATWG `URL` constructor, then allowlist the normalized components:

- `u.protocol === 'https:'` (with the colon)
- `u.hostname === 'signal.group'` — exact equality, never `endsWith`, which accepts `evilsignal.group`
- no credentials, no port, no query string
- anchored regex over a flat character class on the fragment
- **preserve the fragment.** Signal puts the invite key there deliberately so it is never transmitted to a server. A validator that strips it destroys the link. Validate it as `/^[A-Za-z0-9_-]{1,128}$/` against `u.hash.slice(1)`.

**Every regex touching user input** — here and in the sanitizer's whitespace, combining-mark, and script-restriction patterns — uses a flat character class with no nested quantifiers, no quantified alternation, and no backreferences. Anchoring and a length bound do **not** prevent catastrophic backtracking; only the shape of the pattern does.

Store the normalized `u.href`. **Re-validate at render, not only at submit** — the JSON lives in a repo that a later bad commit can edit.

Denylisting schemes does not work: browsers strip leading whitespace, control characters, and embedded tabs inside the scheme, so `java\tscript:` executes.

### Injection notes specific to this codebase

- Astro escapes `{expr}` and `set:text`. It does **not** escape `set:html`, and markdown bodies rendered via `<Content />` pass raw HTML through. Keep every event field a typed string in JSON.
- `JSON.stringify` does **not** escape `</script>`. The HTML tokenizer terminates the script element at the first literal occurrence regardless of JS string context, so a title of `</script><img src=x onerror=...>` breaks out of the data island. Escape `<`, `>`, `&`, U+2028 and U+2029 before embedding. `<` is a legal JSON string escape, so this is lossless.
- U+2028/U+2029 are legal in JSON but illegal raw in a JS string literal. Unescaped, they throw a SyntaxError, which is a build-breaking denial of service anyone can trigger by typing an exotic character.
- The fold writes via the GitHub contents API. No shell is involved, so there is no command- or argument-injection surface, and no `${{ }}` interpolation of untrusted input into a `run:` block. **The commit message is a constant plus a server-computed count** — `chore: fold events (N added)` — with no submitted content interpolated. GitHub interprets commit messages on the default branch: an event title containing `#123` or `@someone` would close issues or fire mentions from the repo owner's identity. The `author` and `committer` fields are omitted so the token identity is used.
- Honeypot field: hidden with CSS, never `type="hidden"` (bots skip hidden inputs), plus `autocomplete="one-time-code"` so browser autofill does not populate it and lock out real users, plus `tabindex="-1"` and `aria-hidden="true"`.
- Dedupe on the normalized semantic tuple, not a raw-body hash, and separately dedupe on the Signal URL alone. The same link submitted for 40 cities is this form's actual spam shape.

## 7. Organizer codes

**Format:** 4 words from the EFF short wordlist #2 (1296 words, 1296⁴ ≈ 2^41.4). That list has unique 3-character prefixes and edit distance ≥3 between words, which is what survives being read over a bad phone line.

**Why this is enough.** With ~50 live codes, hitting anyone's code takes ~5.6 × 10¹⁰ attempts on average. At a distributed million guesses per day that is roughly 56,000 years. The entropy is the anti-guessing control; rate limiting is a spend shield, not a security boundary.

**Normalization (fixed now, documented, never changed):** NFKC → lowercase → strip everything outside `a-z` → rejoin with single hyphens. `"Drum Yoga Vivid Clay"`, `drum-yoga-vivid-clay`, and a paste with a trailing space all produce one digest. Changing normalization later invalidates every issued code.

**Verification:**

```
digest = createHmac('sha256', PEPPER).update(normalized, 'utf8').digest('hex')
record = await getStore({ name: 'codes', consistency: 'strong' }).get(digest, { type: 'json' })
reject if !record || record.revoked
```

The digest **is** the Blobs key. There is no comparison loop, therefore no `timingSafeEqual` length-oracle bug to get wrong, and no timing signal to exploit, because the attacker cannot compute the key without the pepper.

`consistency: 'strong'` is mandatory. The default eventual model lets a revoked code keep working for up to 60 seconds.

**Pepper:** 32 random bytes, hex, in `ORGANIZER_CODE_PEPPER`. Set through the Netlify UI, scoped to **Functions only** so it cannot leak into the Astro client bundle or build logs, marked as containing secret values.

**Scope is orthogonal to deploy context, and this is easy to get wrong.** A Functions-scoped variable is present in the function runtime of *every* deploy preview and branch deploy unless a per-context value is set. Set `ORGANIZER_CODE_PEPPER` and the fold's GitHub credential as **production-context-only**, leaving deploy-preview and branch-deploy unset so those functions hit the fail-closed path below. Confirm the team's sensitive-variable policy for untrusted deploys is "require approval" or "deploy without sensitive variables". Variables declared in `netlify.toml` are not available to functions at all. Fail closed at function start if it is missing.

**Rejected alternatives:**

- *argon2id / bcrypt.* Native modules. esbuild has no `.node` loader, so they need an `external_node_modules` exception and a prebuilt binary matching the Lambda arch, and `netlify dev` breaks locally on the exact auth path you most want to test. At 41 bits a memory-hard KDF only makes a leaked store crackable in days rather than never; the pepper makes it worthless.
- *Plain SHA-256.* Unsalted, one GPU pass over the 41-bit keyspace recovers all 50 codes simultaneously in about 2 minutes.
- *Env var JSON.* Revocation would require a redeploy, and ~50 records sits at the 5,000-character value ceiling.
- *Committed digest file.* Permanently published in a public repo, unrevocable from git history.

**Optional hardening, deferred:** scrypt with a per-code salt under the HMAC. Costs the O(1) key lookup (you need the salt before you can hash, so you must iterate) plus ~100ms. Note `scryptSync` at N=32768, r=8 throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` unless `maxmem` is passed explicitly; Node's default 32 MiB is exactly at the limit.

### 7.1 Issuing and revoking: `scripts/organizer-codes.mjs`

A small CLI committed to the repo and run locally by the maintainer. It writes directly to the production Blobs store, so issuing and revoking both take effect immediately with no deploy and no commit.

```
node scripts/organizer-codes.mjs issue "handle-jay" [--clip]
node scripts/organizer-codes.mjs revoke "handle-jay"
node scripts/organizer-codes.mjs list
```

**`issue`**

1. Draws 4 words from `scripts/data/eff-short-wordlist-2.txt`, committed so generation is auditable, using `crypto.randomInt` (rejection-sampled, never `Math.random`).
2. Prints the code once, prominently, and copies it to the clipboard with `--clip`. **This is the only moment the plaintext exists.** It is never written to a file, never logged, never stored.
3. Normalizes it and computes `HMAC-SHA256(pepper, normalized)`.
4. Writes `codes/<digest>` → `{ pseudonym, issuedAt, revoked: false }`.

**`revoke`** flips `revoked: true` on the matching record and tombstones every event carrying that `codeDigest`. It then prompts to trigger the fold, so the takedown reaches the static HTML in ~2 minutes rather than waiting for Sunday (§16).

**`list`** prints pseudonym, issue date, and revoked state. It cannot print codes; the digests are one-way, which is the point.

Three things this design has to get right:

**Normalization must be shared, never reimplemented.** The CLI and the submit function both import `normalizeCode()` and `digestCode()` from `src/lib/organizer-code.ts`. Two copies will drift, and the failure is silent: codes issued after the drift simply never validate, and the only symptom is a confused organizer.

**Pepper canary.** The CLI reads `ORGANIZER_CODE_PEPPER` from a gitignored `.env`; production reads it from a Functions-scoped Netlify variable. If those diverge, every newly issued code fails and nothing announces it. On first run the CLI writes `meta/pepper-canary` → `HMAC(pepper, "deflocksc-canary")`; every subsequent `issue` verifies the canary first and refuses to write if it does not match.

**Fail closed on auth.** Writing to the production store needs a Netlify token (`netlify login`, or `NETLIFY_AUTH_TOKEN`) plus the site ID. Missing either must be a clear error, never a silent fall-through to a local development store — a code issued into a local store looks like success and fails in production.

**The CLI must never:** write plaintext to a file, accept a code as an argument (it would land in shell history — pseudonyms only), commit anything, or print a code during `list`.

**Storage exposure:** Netlify holds the digests. They are not reversible without the pepper, but pseudonyms and issue dates are readable and producible under subpoena. Store the pseudonym only. Keep the pseudonym-to-person mapping offline, wherever the vetting conversation happened.

## 8. Rate limiting

Netlify's native rate limiting is a burst shield, not a budget enforcer. Verified constraints:

- **2 code-based rules per project on Free *and* Personal.** Only Pro gets 5. Upgrading Free → Personal buys zero additional rules. Function `config.rateLimit` rules and `netlify.toml` `[redirects.rate_limit]` rules share the same quota.
- `windowSize` is capped at **180 seconds** with no carry-over, so a daily budget is not expressible natively.
- `aggregateBy` accepts only `'ip'` and `'domain'`. Domain-only aggregation, the natural way to cap total spend, is Enterprise.
- The action value is `'rate_limit'` (the default) or `'rewrite'`. Not `'block'`, despite the docs prose.
- Once tripped, the action persists for a fixed 60 seconds regardless of `windowSize`.
- There is no `algorithm` field; fixed vs sliding window is undocumented.

**Design:** one native rule on `/api/submit-event` as the cheap outer wall (blocks at the edge, consumes no function compute), plus a Blobs-backed aggregate daily counter inside the function for the requests that get through. Hold the second native rule in reserve.

The Blobs counter uses optimistic concurrency: strongly-consistent `getWithMetadata` for the etag, mutate, `set(..., { onlyIfMatch: etag })`, retry on `modified === false` with bounded attempts. Key per day and per salted-hash-of-IP so old keys age out and the daily reset is implicit. **Hash the IP, never store it raw** — a plaintext IP submission log is exactly the artifact this site criticizes.

Netlify's docs simultaneously ship an `onlyIfMatch` CAS API and state "Netlify Blobs does not include a concurrency control mechanism." Atomicity is undocumented. Size the limit with slack; treat it as best-effort.

Fail-open on a Blobs error (keep the form usable) is the chosen behavior. Fail-closed would let a Blobs incident silently kill submissions.

## 9. Signal link delivery

A function at `/go/:eventId`, configured in code:

```js
export const config = { path: "/go/:eventId", method: ["GET"] }
// read via context.params.eventId
```

Setting `config.path` **replaces** the default `/.netlify/functions/go` URL rather than adding to it, so there is no second unprettified entry point.

**Return 200 with a meta-refresh, not a 302.** A 302's `Location` header is constructed server-side and carries the invite key. Netlify function logs cannot be disabled, are readable by any Team Owner or Developer, and retain 24 hours (7 days on higher plans). Response bodies appear in no Netlify log schema; response headers are not in the documented schema either, but "not in the documented schema" is weaker than "provably never recorded." The body is the conservative choice and costs nothing.

```html
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="0;url=https://signal.group/#KEY">
<a href="https://signal.group/#KEY" rel="noreferrer">Join the group</a>
```

Zero-delay refresh works with JavaScript disabled, which matters because Tor Browser at Safest runs no JS and those are the most at-risk readers. Non-zero delays would trip WCAG 2.2.1/2.2.4; `content="0;..."` is the safe form. Note `rel="noreferrer"` (no hyphen) is anchor-only and does not cover the meta-refresh navigation; the document-level `<meta name="referrer" content="no-referrer">` (with hyphen) is required.

Send `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on the response. A 302 does not reset the referrer to `/go/x`; the original page carries across the hop, so without this signal.group would receive `https://deflocksc.org/` as the referrer.

Keep `eventId` opaque and non-enumerable. It is the one part that does appear in the function-log `path` field.

**Validate the parameter before doing anything with it.** `/go/:eventId` rejects any id not matching `/^[a-z2-7]{8}$/` before performing a lookup. `params.eventId` is **never** interpolated into a response body, a response header, a cache tag, or an ETag. The natural refusal copy ("No event found for k7m29qxb") is reflected XSS on the deflocksc.org origin, delivered by a link, needing no organizer code and no stored value — and §14 notes the CSP currently provides essentially no XSS mitigation, so nothing catches it downstream.

**All refusal conditions return one identical response.** Unknown id, past date, tombstoned event, and revoked code produce the same status, the same static body, and the same headers. Perform every lookup before branching so the work is constant-shaped, and record the distinguishing reason in structured function logs only. Otherwise a maintainer who declines the fold prompt after a revoke leaks "this organizer's events were pulled" for up to a week, because the baked page still lists an event that `/go` refuses.

**This endpoint fails CLOSED, without exception.** If a Blobs read throws, times out, returns malformed JSON, or the store factory itself fails, `/go/:eventId` serves the same refusal as an unknown id. It never falls through to the invite. Failing open here would serve a revoked event's Signal link during an outage, which is precisely the failure revocation exists to prevent, and an attacker who can induce store errors would get exactly what the redirect was built to deny.

This is deliberately the opposite of the rate limiter (§8), which fails **open**. The asymmetry is the point and neither should be "harmonised" with the other:

| | On store failure | Why |
|---|---|---|
| Rate limiter | Allow the request | Failing closed would kill legitimate submissions during a Blobs incident. The cost of being wrong is spend, bounded by the native edge rule. |
| `/go/:eventId` | Refuse | The cost of being wrong is disclosing an invite that was supposed to be dead. Unbounded and unrecoverable. |

The rule generalises: **fail open when the cost of a false negative is money, fail closed when it is disclosure.**

**Every Blobs read on this path uses `consistency: 'strong'`** — both the `events` and `codes` lookups. The default eventual model would resolve a tombstoned event's real invite URL for up to 60 seconds after revocation, which is exactly the window a burned code or an infiltrated group creates. Eventual reads are permitted only on `/api/events`.

**The redirect refuses to resolve** when the event date has passed, when the event is tombstoned, or when the owning code is revoked. This is how "past events stay visible with the link stripped" is enforced: the link was never in the bundle, so there is no client-side filter shipping links it then hides.

The intake group uses the same mechanism at `/go/intake`. Its value is replaceability rather than rotation: if the group has to be burned and rebuilt, every reference on the site, in old posts, and on printed material keeps working after a one-value change in Blobs.

## 10. Recurrence, expiry, renewal

Recurrence is stored as a rule, never expanded into rows. Expansion happens at render.

- `freq`: `weekly` or `monthly_nth` (the Nth weekday of the month, derived from `date`).
- `until` is required and capped at 6 months from `date`.
- When `until` passes, the series stops rendering and the organizer must resubmit. This forces a periodic "is this Signal link still live, is this organizer still active" check and prunes abandoned events.

Past occurrences remain listed with date, city, and county. `/go/:id` refuses them.

**Expiry filtering must happen at build time and in the overlay function, never client-side.** A client-side date filter still ships every past event in the JSON bundle.

Add a build-time guard that fails the build on any event more than 30 days past its date (or past `recurrence.until`) that has not been expired, so neglect surfaces as a broken deploy rather than a silently rotting page.

## 11. Map

`camera-map.ts` is a single-instance module: `let map` at module scope, with `container: 'camera-map'`, center, zoom, and the data fetch all hardcoded. It cannot back a second map. Extract a factory, or write a sibling module.

**The events map must not load `camera-data.json`** — 804 KB same-origin and billed, already the largest single line in the site's bandwidth. This is the difference between a 470 KB and a 1,274 KB events page.

**Layers, crossfading around z7–8:**

- Below z8: county fill shaded by event count, plus a symbol layer of count badges at county centroids. Needs only a county name string; the 46 county polygons already ship in `public/districts/`.
- Above z8: city-centroid circle + label layers.

**City centroids.** There is no city coordinate source anywhere in the repo. `registry.json` has 46 counties and 50 places with no geometry, and `public/districts/` holds only 2 city polygons and is regenerated from the `open-civics-boundaries` npm package on every `prebuild`, so it cannot be hand-extended.

Add `scripts/build-city-centroids.py`, in the same shape as `build-camera-counts.py`, geocoding every allowlisted place once through the existing `/api/geocode` Census proxy and committing `src/data/city-centroids.json`. Because `city` is an enum, every event is guaranteed a centroid with no runtime geocoding and no missing-coordinate case.

**No coordinate jitter.** Random offsets are reversible: average them across a recurring meetup at one venue and the true point falls out. The answer to not wanting a venue coordinate is to never collect one.

**Honesty of the pin.** A city centroid says "here" when it means "somewhere in this city," and in a small SC town it can sit a block from the only plausible venue. Label pins with the city name, not the event title, and make the popup read "exact location shared in the group." The statewide view, which most visitors see, stays at county granularity.

`geo-utils.ts:computeBBox()` branches only on Polygon and MultiPolygon and ignores Point geometries, so it cannot fit-bounds over pins. Either extend it or use `SC_BBOX` from `district-matcher.ts:52`.

MapLibre chrome is styled with `#camera-map :global(.maplibregl-*)` in `MapSection.astro`. A new container id gets unstyled default controls.

## 12. Page layout

**Desktop:** map left and sticky, list right. List/Month toggle and filter chips (county, event type) above.

**Mobile:** tabs in the order **List / Month / Map**. List is the default. MapLibre is 261 KB of the events page's 470 KB, so it loads only when the Map tab is tapped.

**Event card:** date block, title, time, city + county, and a type badge — amber "Location in group" for meetups, green "Public event" where an address is shown. Meetups carry a "Join Signal group" action pointing at `/go/:id`.

**Empty state** (whole calendar or a filtered county): past-event count as social proof, then "Email us" and "Join the Signal group". The Signal button opens the warning dialog; only the confirm inside it navigates to `/go/intake`, so the URL is not in the page for a scraper that never clicks.

`lighthouserc.json` audits only `/` and `/blog/`. Add `/events` or the new page is unaudited, and CI hard-fails below accessibility 0.85 / best-practices 0.90 / SEO 0.90.

## 13. Copy

Registers: `personal` for the setup checklist, `advocacy` for the warning. Both drafted below; the full copydesk review gate runs at implementation, not in this design.

### Signal setup popup, shown at the Signal-link field

> **Before you paste that link**
> Four things, once per group.
>
> 1. **Give it a boring name and leave the description blank.** Anyone holding the link can read your group's name, description, and member count without joining. "Thursday group" tells them nothing. "Greenville DeflockSC organizers" tells them your chapter exists and how many of you there are. The address never goes in the description.
> 2. **Set disappearing messages before you invite anyone.** Group Settings › Disappearing Messages. 1 week is a fine default. Do it first, or the early messages stay forever.
> 3. **Hide your own number.** Settings › Privacy › Phone Number › Nobody. Set a username instead. You're about to be in a room with strangers.
> 4. **Burn the group when the event's over.** Have everyone leave, then delete it. Move the people you trust into a separate group. Don't reuse an event group for anything else, and only keep one alive if the event actually recurs.

"Approve new members" is deliberately absent. The group is meant to be open so strangers can find it; the control here is that the group is temporary and destroyed, not that it has a door.

### Intake warning, gating the "Join the Signal group" button

> **Before you join**
> This group is unvetted, which is the point (it has to be open for strangers to find us) and also the risk: everyone who can read this page can join it, including bad actors or people whose interest in South Carolina organizing is professional (journalists, police, etc.). Please do not share anything in this chat that you wouldn't want published or used against you in court.
>
> Two minutes of setup first. Open Signal, set a username, and switch Privacy › Phone Number to Nobody. Use a name you don't mind strangers keeping.
>
> [I've done that, open Signal] [Cancel]

## 14. Adjacent fixes folded in

**CSP.** Current value, `public/_headers` line 6, is the only definition in the repo (the other headers are duplicated in `netlify.toml` lines 28–34, but CSP is not):

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is https://api-gateway.umami.dev; frame-src 'self'; worker-src blob:; frame-ancestors 'none'
```

Add `base-uri 'none'`, `form-action 'self'`, and `object-src 'none'`. None of the three fall back to `default-src`, and without `base-uri` an injected `<base href="//evil.tld">` reroutes every relative script URL and defeats `script-src 'self'` entirely. `connect-src 'self'` already covers same-origin POSTs, so no change is needed for the submit endpoint.

`script-src 'unsafe-inline'` means the CSP currently provides essentially no XSS mitigation. Removing it requires moving the `define:vars` inline scripts out of `ActionModal.astro`, which triggers the mandatory action-modal smoke test. **Scope that as its own PR.**

**Asset caching.** There is no `Cache-Control` configuration anywhere in the repo. Netlify's default `public, max-age=0, must-revalidate` applies to everything including content-hashed `/_astro/*`. Verified: repeat visitors re-download 0 body bytes but pay 13–18 conditional requests each at 343 bytes of response headers, and Netlify meters all requests including 304s. Mark hashed assets `immutable`. This saves more credits than the events feature spends.

**Analytics.** Exclude `/events/*` from the Umami beacon. Proxying through your own domain hides it from ad blockers, not from Umami, and a record of interest in a specific event is exactly what a subpoena would want.

## 15. Cost model

Netlify credit-based pricing. A production deploy is a flat 15 credits regardless of build duration; build minutes are no longer metered.

| Item | Rate |
|---|---|
| Production deploy | 15 credits |
| Deploy preview / branch / failed | 0 |
| Form submissions | 0, unlimited |
| Function compute | 10 credits per GB-hour (allocated memory × wall clock) |
| Bandwidth | 20 credits per GB, cached egress included |
| Web requests | 2 credits per 10,000, all requests including 304s |

Measured: 50 events as JSON is **8.5 KB** brotli on the wire (161 bytes/event). The events page first visit is **470 KB** without the camera layer. Event data is not the cost.

| Scenario | Credits/month |
|---|---|
| Today's baseline (~3 GB, ~5 scheduled deploys) | ~135 |
| Plus events at 2,000 visits/mo | ~153 |
| Plus events at 10,000 visits/mo | ~225 |
| Plus weekly fold (4.3 deploys) | ~290 |

Against 1,000 credits (Personal), that is 29% at busy traffic.

**Denial of wallet.** Netlify has no configurable spend cap; the only such control is for AI Agent Runners. **Leave auto-recharge off** (its default). Exhausting the monthly allowance then pauses every web project on the team — all 3 sites — until the cycle resets, rather than generating an unbounded bill. This is the bound, and it is not scoped to deflocksc.org.

Never call a build hook from a submission handler. Netlify's documented API deploy limit is **3 per minute and 100 per day**, so a submission-triggered deploy would let a code-holder spend 1,500 credits a day — one and a half months of allowance every day — without exceeding any platform limit. Note also that the `ignore` build command does **not** cancel builds triggered by a build hook or the API, and the existing camera-refresh automation already deploys through that path (`deploy_source: "api"`, committer `github-actions[bot]`).

## 16. Threat model and accepted risks

### 16.1 Attack surface inventory

Every entry point, what an unauthenticated attacker reaches there, and the one control that guards it. If a control here is weakened, read the row before deciding it does not matter.

| Entry point | What an attacker reaches | Control |
|---|---|---|
| `POST /api/submit-event` | The only write path into Blobs: publishes an event to the live overlay, sets its `signalUrl`, burns function compute per request | Organizer code (41.4 bits, HMAC-peppered, digest is the key); body cap and rate limit run *before* normalization |
| `GET /api/events` | Every overlay event, unauthenticated, CDN-cached | `toPublicEvent()` allowlist projection (§5). Without it this endpoint serves every Signal invite |
| `GET /go/:eventId`, `/go/intake` | Resolves an opaque id to a live Signal invite | Strict id format check, server-side refusal on past/tombstoned/revoked, identical refusal responses, strong-consistency reads |
| Netlify Blobs (`events`, `codes`, `ratelimit`) | Every invite URL, every code digest with pseudonym and issue date, rate-limit counters | Store factory refusing writes outside `production`; all keys server-generated |
| Scheduled fold + GitHub PAT | Commits to the public repo with a write-scoped token; commit messages are permanent | Contents-only fine-grained PAT, production-context-only, constant commit message |
| `scripts/organizer-codes.mjs` | Issue and revoke against the production store | Local possession of pepper + Netlify token, fail-closed on either, pepper canary on drift |
| Static `/events` | Baked JSON island: city, exact date, exact time for every event | Field allowlist in `src/data/events.json`, build-time schema guard. No invite URLs by construction |
| Deploy previews and branch deploys | Same function runtime, same production Blobs store, from a URL that never touched production | Production-context-only secrets, store factory write refusal |

**The two highest-consequence rows are `GET /api/events` and the GitHub PAT.** The first is one careless line away from publishing every Signal invite as machine-readable JSON. The second is the only credential in the system that can write to the repo, which is the only thing that can change what the site serves.



**Auto-publish was chosen with the tradeoff stated.** Under it, user-written text and, for public events, a street address go live under deflocksc.org with no human reading them first. User-submitted content is the highest-liability content a site can host, and an unreviewed free-text field about a place and often about people is where that liability concentrates. The mitigations are: no free-text field at all on meetups (title only, hard-capped), a typed enum for city and county, revocation with cascade tombstoning, and a manually triggerable fold so a takedown reaches the static HTML in about 2 minutes rather than waiting a week.

**What the organizer code does and does not do.** It stops unauthenticated submission. It cannot catch a real organizer submitting wrong details, an unsafe venue, or a defamatory description, and those are the higher-probability failures.

**When a code leaks.** Leaks happen by ordinary means — a screenshot, a group chat, a phone photographed at a meeting — and they are undetectable. Per-organizer codes make revocation one flag flip and one conversation. The cost is holding a code-to-pseudonym map, which is why the pseudonym-to-person mapping stays offline.

**Scraper obfuscation is anti-indexing hygiene, not security.** With a small finite link set, no client-side technique raises a targeted attacker's cost: twelve events is twelve requests. What `/go/:id` genuinely buys is that the URL is absent from the bundle, the search index, the Wayback Machine, and git history, and that it is replaceable in one edit. Base64/ROT13 decoding on load does not stop Googlebot, which renders JS; that is how roughly 470,000 private WhatsApp invites became searchable in 2020.

**Withholding the address protects the venue and the host, not the attendees.** A library, church, or private home never gets indexed and never gets the cancellation-pressure calls. But the decisive leak is the time window: city plus exact date plus exact time supplies both inputs an ALPR query needs, and an adversary with Flock access can pull every plate through a town's cameras across the meeting window and intersect. Withholding the street address does not touch the technology this site exists to oppose. Tim chose to keep date and time knowingly. The site copy should not oversell what the control does; on an anti-surveillance site, overstating a privacy control costs more credibility than not having one.

## 17. Testing

- Unit: Signal URL validator against the full hostile corpus (`javascript:`, `java\tscript:`, `evilsignal.group`, credentials, ports, query strings, fragment-stripping regressions).
- Unit: text sanitizer against a hostile corpus of its own — bidi overrides (`U+202E`), zero-width runs, a Zalgo stack, fullwidth homoglyphs, Cyrillic lookalikes, an 80-emoji title, a title that is 80 code units but 20 graphemes and one that is 20 code units but 80, unassigned code points, and a newline mid-title. Each must be rejected, and the rejection message must not echo the offending string back into a log.
- Unit: normalization is idempotent, and two strings differing only by zero-width characters collapse to the same duplicate-detection key.
- Unit: code normalization idempotence, and that a changed normalization is caught.
- Unit: JSON-island escaping for `</script>`, U+2028, U+2029.
- Unit: recurrence expansion, including month-end and DST boundaries.
- Unit: baked/overlay merge, including an id present in both.
- Unit: `toPublicEvent()` — store a record carrying `signalUrl`, `codeDigest`, and an unrecognized extra field; assert the serialized `/api/events` response contains none of the three.
- Unit: the fold's commit-message builder ignores the text fields of its event argument.
- Unit: each sanitizer regex completes in under 5ms against a 300-code-point adversarial string.
- Integration: a request with `Content-Length` over 8192, and a chunked request that exceeds it without declaring it, are both rejected before parsing.
- Integration: `/go/:id` refuses past, tombstoned, and revoked-code events, and the refusal body for a hostile id contains no substring of the request path.
- Integration: all four `/go` refusal conditions return byte-identical responses.
- Integration: the Blobs store factory refuses writes when `CONTEXT` is not `production`.
- Integration: revocation cascade tombstones every event for that code.
- Build guard: fail on an event more than 30 days past its date that has not been expired.
- Schema guard: `src/data/events.json` validates against the shared Zod schema at build time, so a hand-edited or fold-corrupted file fails the build rather than rendering.
- **Action-modal smoke test is mandatory** for any change touching `_headers` or `netlify.toml` CSP/proxy rules. A `connect-src` tightening already broke the Census geocoder once.

## 18. Open items requiring verification

1. **Signal group metadata leak.** The claim that anyone holding a group link can read the group's title, description, and member count without joining is from secondary sources; `support.signal.org` returned 403. Step 1 of the setup checklist depends on it. Tim to verify against a real group before shipping instructions that rely on it.
2. **Netlify plan.** The API reports the project's plan slug as `nf_team_dev`, historically the free tier, but Tim reports paying ~$10/month and the team was created 2026-03-03 (post-cutover, so a legacy plan is impossible). Free is 300 credits with a hard pause; Personal is 1,000 with optional auto-recharge. Confirm at `app.netlify.com/teams/timsimpsonjr/billing`.
3. **429 billing.** Whether a rate-limited 429 counts as a billed web request is undocumented. It consumes no function compute. At 2 credits per 10,000, a million blocked requests would be 200 credits, which is material against a 300-credit allowance.
4. **GitHub-API commits triggering Netlify builds.** Highly likely but not stated in Netlify's docs. Worth one empirical test before relying on the fold.
5. **Blobs conditional-write atomicity.** Undocumented. Treat the rate-limit counter as best-effort.

## 19. Relationship to the Sign Night poster work

`docs/plans/2026-08-07-sign-night-poster-design.md` specifies `src/data/event-poster.json` with a `qrUrl` field marked TBD that will hold a `signal.group` link, and already plans a fail-on-placeholder build guard. **Wire the Signal URL validator from §6 into that guard.** A QR code is an unusually good phishing vehicle because nobody proofreads a URL they scan off a poster, and a hostile link on an official-looking DeflockSC poster is worse than the same link on a web page. Add it while the field is still hand-edited, rather than retrofitting once values arrive from strangers.
