# Shopify Setup Handoff

The shop page code is built and waiting for products. Here's what you need to do in the Shopify/Printify dashboards to wire it up.

## 1. Printify (already connected to Shopify)

### T-shirt
- Catalog → search **"Next Level 6410"** (Sueded Tee)
- Pick a US-based print provider with good reviews
- Upload your design, position it
- Choose colors you want to offer
- Set base retail price (this becomes your minimum PWYW tier)
- **Publish to Shopify**

### Poster
- Catalog → search for poster blanks (pick size/material)
- Upload same design
- Set base retail price
- **Publish to Shopify**

## 2. Shopify Admin — Manual Products

### Yard Sign
- Products → Add product
- Title: something like "Yard Sign — Big Brother Is Watching"
- Description: brief copy about the signage campaign
- Upload a mockup image
- **Don't** check "Track quantity" unless you want to manage inventory
- Set as manual fulfillment (you ship these yourself)

## 3. Add Price-Tier Variants (all products)

For each product in Shopify Admin → Products → [Product] → Edit:

Add an option called **"Price"** (or "Tier") with values like:
- `$25 — Cover the basics`
- `$35 — Support the cause`
- `$50 — Go all in`

Set actual prices on each variant to match the label.

**T-shirt only:** Also add a **"Size"** option (S, M, L, XL, 2XL). This creates a matrix — each size/price combo is a separate variant. Shopify handles this automatically.

**Poster and yard sign:** Just the Price option.

Exact tier amounts and labels are up to you — the site renders whatever variants exist.

## 4. Generate API Tokens

Shopify Admin → Settings → Apps and sales channels → **Develop apps**:

1. Click **Create an app** (name it anything, e.g., "DeflockSC Website")
2. **Storefront API access:**
   - Configure → check `unauthenticated_read_product_listings`
   - Install app → copy the **Storefront access token**
3. **Admin API access:**
   - Configure → check `read_orders`
   - Install app → copy the **Admin access token**

## 5. Configure Environment Variables

### Local (.env file in repo root)
```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=the-storefront-token-you-copied
```

### Netlify (Site settings → Environment variables)
```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=the-admin-token-you-copied
```

## 6. Verify

After setting env vars:
- Run `npm run dev` locally → visit `localhost:4321/shop`
- Products should appear with images, size/price selectors
- Click "Add to Cart" → cart widget should open
- Progress bar will show $0 until there are paid orders

## Notes
- The Storefront token is public (safe in client-side code). The Admin token is private (Netlify env only, never in code).
- If you change products later, trigger a rebuild on Netlify (or it'll update on next push to master).
- Price tier labels come from Shopify variant names — change them in Shopify admin anytime without touching code.
