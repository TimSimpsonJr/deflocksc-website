# Third-party data files in this directory

## `eff-short-wordlist-2.txt`

- **What:** EFF's Short Wordlist #2 — 1296 words (6^4), each with a unique
  3-character prefix and an edit distance of at least 3 from every other word.
- **Source URL:** <https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt>
- **Linked from:** <https://www.eff.org/dice> ("EFF's Short Wordlist #2")
- **Format:** 1296 lines of `<4 dice digits>\t<word>`, tab separated, LF endings.
- **Regenerate with:** `npm run build-wordlist`
- **Integrity:** `eff-short-wordlist-2.sha256` holds a `sha256sum`-format record.
  `src/lib/wordlist-file.test.ts` re-checks the checksum and every structural
  rule on each test run, so a hand-edited or corrupted list fails CI.

Used by `scripts/organizer-codes.ts` to generate 4-word organizer codes
(1296^4 ~ 2^41.4). It is committed rather than fetched at runtime so code
generation is auditable and reproducible, and so issuing a code never depends
on eff.org being reachable.
