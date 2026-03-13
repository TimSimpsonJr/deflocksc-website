## Summary
<!-- What changed and why -->

## Action modal smoke test
If this PR touches `district-matcher`, `action-modal/`, `ActionModal.astro`, `_headers`, `netlify.toml` CSP/proxy rules, or any security hardening:

- [ ] Open modal → enter a SC address → results load without console errors
- [ ] Modal starts at top after results appear (not scrolled to reps)
- [ ] Test on mobile viewport (375px) — same checks
- [ ] Geolocation path works (if location permissions available)
- [ ] Manual dropdown path works
- [ ] "Start Over" resets to input view

## Other testing
- [ ] `npm run build` passes
- [ ] Verified in browser (desktop + mobile)
