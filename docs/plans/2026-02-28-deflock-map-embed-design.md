# Deflock Map Embed Design

## Summary

Replace the "Open the camera map" link button in MapSection with an inline iframe embed of deflock.org's map, centered on Upstate SC.

## Embed Details

- **URL:** `https://deflock.org/map#map=11/34.85/-82.39`
- **Dimensions:** 100% width, 600px height
- **Attributes:** `loading="lazy"`, `allow="geolocation"`, `border: none`, rounded corners
- **Accessibility:** `title="DeFlock ALPR Camera Map"`

## Responsive Behavior

- **Desktop/tablet (md+):** Iframe visible by default. No button.
- **Mobile (<md):** Button visible ("Explore the camera map"). Tapping hides the button, reveals the iframe inline. Handled by a small inline `<script>` toggling class visibility.

## Scope

### Changes

- Remove the `<a>` link button to `deflock.org/?lat=...`
- Add `<iframe>` with correct hash-based URL format
- Add mobile toggle button + inline script
- Use Tailwind responsive classes (`hidden`/`block`/`md:hidden`/`md:block`) for the swap

### No changes

- Body copy (Greenville, Columbia, playbook, HOA paragraphs)
- Section background, glow effects, layout
- Caption text ("Data from Deflock.org...")
- Label text ("Find the cameras in your neighborhood.")
- Footer link to Deflock.org

## Technical Notes

- Deflock's Vue app detects iframe context and hides its own nav/share/report UI
- `loading="lazy"` defers iframe fetch until user scrolls near the section
- No JS framework needed — inline script is a few lines for the mobile toggle
