# DeflockSC Shop Design

## Purpose

Fund a signage campaign to place "big brother is watching you" signs in front of every Flock camera in Upstate SC. The shop sells merch and yard signs, with all proceeds going toward sign production, placement, and ongoing advocacy.

## Page Structure

Top-level `/shop` page. New nav link between Blog and Take Action (desktop and mobile).

### Layout (top to bottom)

1. **Campaign header** — heading, 1-2 sentence mission blurb explaining the signage campaign, transparency note about where the money goes (sign production, placement, advocacy)
2. **Fundraising progress bar** — shows dollars raised toward the current batch of signs. Updates live via Shopify Admin API. Resets per batch (e.g., hit $1,000 → bar resets to "$0 / $1,000 for Batch 2"). Batch target and batch number stored in a local config file.
3. **Product grid** — 3 columns on desktop, 1 column on mobile
4. **Shipping + returns note** — short text at bottom. POD items: 5-10 days. Yard signs: ship in batches once fundraising hits production threshold. Returns: defects only for POD, link to contact for self-fulfilled.
5. **Sticky cart widget** — floating cart icon powered by Shopify Buy Button SDK, positioned below the fixed nav. Shows item count badge.

## Products

| Product | Fulfillment | Variants | Notes |
|---------|-------------|----------|-------|
| T-shirt (Next Level 6410) | Printify POD | Size (S-2XL) x Price tiers | Primary product |
| Poster | Printify POD | Price tiers only | Same design as shirt |
| Yard sign | Self-fulfilled | Price tiers only | Ships in batches, not individually |
| Stickers | Self-fulfilled | Price tiers only | Stretch goal, add if time |

### PWYW Price Tiers

Each product has per-product price tiers as Shopify variants. Exact amounts TBD in Shopify admin. Example structure:

- T-shirt: $25 / $30 / $40 / $50
- Poster: $15 / $20 / $30
- Yard sign: $10 / $15 / $25

Tier labels are descriptive (e.g., "$25 — Cover the basics", "$50 — Go all in"). Labels come from Shopify variant names, so they're editable without code changes.

## Product Card UI

Each card contains:

- **Product image** — Printify mockup, served from Shopify CDN
- **Product name + short description**
- **Size selector** (T-shirt only) — horizontal button row
- **Price selector** — horizontal button row with labeled tiers. Lowest tier selected by default.
- **Add to Cart button**

Button-row selectors use radio group ARIA pattern for accessibility.

## Technical Architecture

### Data Flow

1. **Build time:** Astro fetches product data from Shopify Storefront API (names, descriptions, images, variants with prices). Products render as static HTML.
2. **Client side:** Shopify Buy Button SDK initializes in cart-only mode. "Add to Cart" sends the selected variant ID to the SDK, which manages cart state and checkout redirect.
3. **Checkout:** Shopify-hosted checkout page. No checkout UI on our site.

### Storefront API Token

Public token, safe for client-side use. Stored in `.env` for build-time access:

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=xxxxx
```

### Fundraising Progress Bar

Netlify Function at `/.netlify/functions/shop-progress` (or Netlify Edge Function) fetches order revenue totals from Shopify Admin API.

- **Admin API token** stored as Netlify environment variable (never in code)
- Returns total revenue for the shop
- Client fetches this endpoint on page load, renders progress bar
- Config file (`src/data/shop-config.json`) stores: `batchTarget` (dollar goal per batch), `batchNumber` (current batch), `batchStartRevenue` (revenue at start of current batch, so progress = total - batchStartRevenue)

### Rebuild Trigger

Products change rarely. When updating products in Shopify:
- Option A: manual rebuild on Netlify dashboard
- Option B: Shopify webhook → Netlify build hook (can add later)

### CSP Changes

Add to `public/_headers` Content-Security-Policy:

- `script-src`: add `https://cdn.shopify.com`
- `style-src`: add `https://cdn.shopify.com`
- `img-src`: add `https://cdn.shopify.com`
- `connect-src`: add `https://*.shopify.com`
- `frame-src`: add `https://*.shopify.com`

### SEO

- `Product` JSON-LD per product (name, image, price range, availability)
- OG meta tags for `/shop` page
- Page title: "Shop — DeflockSC"
- Page description referencing the signage campaign

## Shopify Setup (pre-coding)

1. Connect Printify to Shopify store
2. Create T-shirt in Printify (Next Level 6410), push to Shopify
3. Create poster in Printify, push to Shopify
4. Create yard sign as manual product in Shopify
5. Add price-tier variants to each product (Size x Price for shirt, Price only for others)
6. Set variant labels with descriptive PWYW names
7. Upload Printify mockup images
8. Generate Storefront API access token (for build-time product fetch)
9. Generate Admin API token with `read_orders` scope (for progress bar)
10. Add Admin API token to Netlify environment variables

## Design Notes

- Dark theme matching site (`#171717` bg, `#1a1a1a` card bg, `#dc2626` accent)
- Product images use existing glow-frame treatment or simple bordered cards
- Progress bar in red (`#dc2626`) with animated fill
- Cart widget styled to match nav (dark bg, red accent for count badge)
- Mobile: single-column cards, full-width price/size buttons, cart icon in bottom-right corner
