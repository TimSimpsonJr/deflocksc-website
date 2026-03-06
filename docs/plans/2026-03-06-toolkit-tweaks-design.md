# Toolkit Tweaks Design

Three changes to the citizen toolkit feature.

## 1. Homepage CTA: Move Into Bill Tracker

Move the standalone toolkit CTA section into the bottom of BillTracker.astro. Remove the separate `<section>` from index.astro (lines 17-24).

**Layout:** Divider (`border-t border-[#404040]`) below the bill status notes, then center-aligned:
- Headline: "Ready to take the next step?"
- 4 SVG outline icons (32px, `#a3a3a3`) with uppercase labels:
  - Document icon → "FOIA Templates"
  - Microphone icon → "Talking Points"
  - Card icon → "Printables"
  - Scales icon → "Legal Guide"
- Red CTA button: "Open the Citizen Toolkit"
- Icons stack to 2x2 grid on mobile

**Files:** `src/components/BillTracker.astro`, `src/pages/index.astro`

## 2. Business Card Image Previews + Lightbox

Replace the styled text-div card previews in ToolkitOutreach with actual `<img>` tags pointing to the generated PNGs. Add click-to-zoom via inline expand lightbox.

**Lightbox behavior:** Click a card image and it scales up in place (CSS `transform: scale(1.8)` with `z-index: 50`). A dark dimmer overlay appears behind it. Click the dimmer or the card again to collapse. Escape key also closes.

**Hover state:** Slight scale-up (`1.02`) with a magnifying-glass-plus icon overlay on hover.

**Files:** `src/components/ToolkitOutreach.astro`

## 3. Rework Three Business Card Designs

Regenerate card-1984, card-city-council, and card-surveillance with photographic/illustration backgrounds. card-1000-eyes stays unchanged.

### Image mapping

| Card | Background image | Source |
|------|-----------------|--------|
| card-1984 | Hero recreation: camera array + light cones on dark bg | `hero-cameras.png` + rendered light cone SVG |
| card-city-council | Single camera on pole, dark bg | New source image saved to `public/toolkit/outreach/single-camera.png` |
| card-surveillance | Hero recreation: same camera array + light cones, different crop | `hero-cameras.png` + rendered light cone SVG |
| card-1000-eyes | Unchanged | eye-graphic.png |

### Hero recreation details

Recreate the hero section's visual treatment as a static image at business card dimensions (1050x600 at 2x):

1. Dark background (`#171717`)
2. Camera array illustration (`hero-cameras.png`) positioned in upper portion, with `brightness(0.85)` and bottom fade mask
3. Static light cones: SVG polygons rendered at a fixed mid-sweep angle (~5deg), same white-to-transparent gradient with Gaussian blur as the hero. Use 3 inner cones only (outer ones would extend beyond card edges).
4. Text headline overlaid with `text-shadow` for readability
5. QR code in bottom-right, `deflocksc.org` in bottom-left

For card-1984 vs card-surveillance: same base treatment but different text and potentially different cone angles or camera crop position to make them visually distinct.

### Generation approach

Switch from pure satori to a **sharp composite pipeline**:
1. Create dark background canvas in sharp
2. Composite source image (camera array or single camera) with brightness/mask adjustments
3. Composite light cone SVG layer (rendered to PNG via sharp's SVG input)
4. Composite satori-rendered text+QR layer on top (with transparency)

**Files:** `scripts/generate-business-cards.js`, new source image

## Cleanup

Delete mockup files after implementation:
- `public/mockup-cta.html`
- `public/mockup-lightbox.html`
