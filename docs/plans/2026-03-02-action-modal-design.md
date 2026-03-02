# Action Modal Design

Convert the inline Take Action widget into a full-screen modal overlay triggered by buttons.

## Trigger Points

Three elements currently link to `#take-action`:

1. **Nav "Take Action" button** (desktop + mobile)
2. **Hero "Email Your Legislators" CTA**
3. **Inline section form**

New behavior: all three open the modal overlay instead of scrolling. The inline `#take-action` section keeps its heading + intro text but replaces the form widget with a single "Email Your Legislators" button that also opens the modal.

## Overlay Structure

Full-screen takeover:

- Fixed `inset-0`, `z-index: 60` (above nav's z-50), `bg-[#0f172a]`
- Scrolls naturally via `overflow-y: auto` on the overlay itself
- Content centered with `max-w-2xl mx-auto`, generous padding
- Close button: X in top-right corner, fixed position so it stays visible while scrolling results
- Escape key closes it
- Hidden by default, toggled via `.hidden` class
- No heading/intro inside the overlay — goes straight to address input since the user already read the context on the page

## Component Split

- **`TakeAction.astro`** — Inline section. Heading, intro text, "Email Your Legislators" button. Thin.
- **`ActionModal.astro`** — The overlay. Contains all widget markup (input, loading, results, error states) + `<script>` with all logic. Rendered in `Base.astro` outside `<main>`.

## Body Scroll Lock

When the overlay is open, `document.body` gets `overflow: hidden` to prevent background scrolling. Removed when closed.

## Focus Management & Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-label="Contact your representatives"`
- On open: focus moves to the address input
- On close: focus returns to the button that opened it
- Focus trap: Tab cycles within the overlay while open
- `prefers-reduced-motion`: no transition animation, instant show/hide
