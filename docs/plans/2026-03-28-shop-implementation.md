# DeflockSC Shop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/shop` page that sells merch to fund a signage campaign, with custom product cards, PWYW price-tier selectors, Shopify Buy Button SDK for cart/checkout, and a live fundraising progress bar.

**Architecture:** Static Astro page fetches product data from Shopify Storefront API at build time. Custom product card components render size/price selectors as button rows. Shopify Buy Button SDK handles cart state and Shopify-hosted checkout. A Netlify Function proxies the Shopify Admin API for a live fundraising progress bar.

**Tech Stack:** Astro 5, Tailwind CSS 4, Shopify Storefront API (GraphQL), Shopify Buy Button SDK (`buy-button-storefront.min.js`), Netlify Functions (serverless), Shopify Admin API (GraphQL)

**Design doc:** `docs/plans/2026-03-28-shop-design.md`

---

### Task 1: Shopify Setup (Manual — User)

This task is done by the user in the Shopify admin and Printify dashboard, not in code.

**Step 1: Connect Printify to Shopify**

In Printify dashboard → Manage Stores → Connect Shopify. Follow OAuth flow.

**Step 2: Create T-shirt product in Printify**

- Select Next Level 6410 blank
- Upload design
- Set base price (this becomes the minimum tier)
- Push to Shopify

**Step 3: Create poster product in Printify**

- Select poster blank
- Upload design
- Push to Shopify

**Step 4: Create yard sign as manual Shopify product**

In Shopify Admin → Products → Add product:
- Title: "Yard Sign — Big Brother Is Watching"
- Description: brief copy about the signage campaign
- Upload mockup image
- Set as manual fulfillment

**Step 5: Add price-tier variants to each product**

For each product in Shopify Admin → Products → [Product] → Variants:

T-shirt: Add option "Price" with values. Then combine with option "Size" (S, M, L, XL, 2XL).
Example variant names: "$25 — Cover the basics / Size M", "$50 — Go all in / Size L"

Poster: Add option "Price" only.
Yard sign: Add option "Price" only.

**Step 6: Generate Storefront API access token**

Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app → Configure Storefront API access → Select `unauthenticated_read_product_listings` scope → Install → Copy token.

**Step 7: Generate Admin API access token**

Same app → Configure Admin API access → Select `read_orders` scope → Install → Copy token.

**Step 8: Configure environment variables**

Add to local `.env`:
```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=shpat_xxxxx
```

Add to Netlify dashboard → Site settings → Environment variables:
```
SHOPIFY_ADMIN_TOKEN=shpat_xxxxx
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

**Step 9: Commit**

No code changes in this task. User confirms Shopify setup is complete before proceeding.

---

### Task 2: Install Shopify Buy Button SDK dependency + env config

**Files:**
- Modify: `.env.example`
- Modify: `astro.config.mjs`

**Step 1: Add Shopify env vars to `.env.example`**

Add to `.env.example`:

```
# Shopify Storefront API (public token, safe for client-side)
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=
```

**Step 2: Verify Astro can read env vars**

Astro reads `import.meta.env` automatically from `.env`. No config changes needed — Astro 5 supports `import.meta.env` for server-side (build-time) code natively. Vars without `PUBLIC_` prefix are only available server-side (build time), which is what we want for the Storefront API fetch.

**Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add Shopify env vars to .env.example"
```

---

### Task 3: Create Shopify Storefront API fetch utility

**Files:**
- Create: `src/lib/shopify.ts`

**Step 1: Write the Storefront API client**

```typescript
// src/lib/shopify.ts
// Build-time only — fetches product data from Shopify Storefront API

const SHOPIFY_STORE_DOMAIN = import.meta.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_STOREFRONT_TOKEN = import.meta.env.SHOPIFY_STOREFRONT_TOKEN;

interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

interface ShopifyVariant {
  id: string;
  title: string;
  price: { amount: string; currencyCode: string };
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml: string;
  featuredImage: ShopifyImage | null;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: { name: string; values: string[] }[];
}

const PRODUCTS_QUERY = `
  query {
    products(first: 20) {
      edges {
        node {
          id
          title
          handle
          description
          descriptionHtml
          featuredImage {
            url
            altText
            width
            height
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
                width
                height
              }
            }
          }
          options {
            name
            values
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                availableForSale
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function shopifyFetch(query: string): Promise<any> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/api/2025-01/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Shopify Storefront API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

export async function getProducts(): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch(PRODUCTS_QUERY);
  return data.products.edges.map((edge: any) => ({
    ...edge.node,
    images: edge.node.images.edges.map((e: any) => e.node),
    variants: edge.node.variants.edges.map((e: any) => e.node),
  }));
}
```

**Step 2: Verify types compile**

Run: `npx astro check` (or just verify no red squiggles in editor)

**Step 3: Commit**

```bash
git add src/lib/shopify.ts
git commit -m "feat: add Shopify Storefront API fetch utility"
```

---

### Task 4: Create shop config JSON

**Files:**
- Create: `src/data/shop-config.json`

**Step 1: Create the config file**

```json
{
  "batchTarget": 1000,
  "batchNumber": 1,
  "batchStartRevenue": 0,
  "campaignHeadline": "Fund the Signs",
  "campaignBlurb": "Every dollar you spend here goes toward putting \"Big Brother Is Watching You\" signs in front of Flock cameras across Upstate South Carolina.",
  "transparencyNote": "Proceeds fund sign production, placement, and ongoing advocacy against warrantless license plate surveillance.",
  "shippingNote": "T-shirts and posters ship in 5\u201310 business days via Printify. Yard signs ship in batches once we hit the next funding milestone.",
  "returnsNote": "Returns accepted for defective items only. Contact us for self-fulfilled items."
}
```

**Step 2: Commit**

```bash
git add src/data/shop-config.json
git commit -m "feat: add shop campaign config"
```

---

### Task 5: Create Netlify Function for fundraising progress

**Files:**
- Create: `netlify/functions/shop-progress.ts`

**Step 1: Create the Netlify Functions directory**

Run: `ls netlify/functions` — if it doesn't exist, that's expected.

**Step 2: Write the function**

```typescript
// netlify/functions/shop-progress.ts
// Returns total shop revenue from Shopify Admin API for the progress bar

import type { Context } from "@netlify/functions";

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

const ORDERS_QUERY = `
  query($cursor: String) {
    orders(first: 50, after: $cursor, query: "financial_status:paid") {
      edges {
        cursor
        node {
          totalPriceSet {
            shopMoney {
              amount
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

async function fetchAllOrderTotals(): Promise<number> {
  let totalRevenue = 0;
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/graphql.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
      },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: { cursor },
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Admin API error: ${response.status}`);
    }

    const json = await response.json();
    if (json.errors) {
      throw new Error(`Shopify Admin API GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const edges = json.data.orders.edges;
    for (const edge of edges) {
      totalRevenue += parseFloat(edge.node.totalPriceSet.shopMoney.amount);
    }

    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    if (edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    }
  }

  return totalRevenue;
}

export default async (req: Request, context: Context) => {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const totalRevenue = await fetchAllOrderTotals();
    return new Response(JSON.stringify({ totalRevenue: Math.round(totalRevenue * 100) / 100 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // cache 5 minutes
      },
    });
  } catch (err: any) {
    console.error('shop-progress error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch revenue data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

**Step 3: Test locally (if Netlify CLI is available)**

Run: `npx netlify dev` and visit `http://localhost:8888/.netlify/functions/shop-progress`

If Netlify CLI isn't installed, skip — this will be tested after deploy.

**Step 4: Commit**

```bash
git add netlify/functions/shop-progress.ts
git commit -m "feat: add Netlify Function for shop fundraising progress"
```

---

### Task 6: Create the Shop page and product card component

**Files:**
- Create: `src/pages/shop.astro`
- Create: `src/components/ProductCard.astro`

**Step 1: Create the ProductCard component**

```astro
---
// src/components/ProductCard.astro
interface Variant {
  id: string;
  title: string;
  price: { amount: string; currencyCode: string };
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
}

interface Props {
  title: string;
  description: string;
  image: { url: string; altText: string | null; width: number; height: number } | null;
  variants: Variant[];
  options: { name: string; values: string[] }[];
  handle: string;
}

const { title, description, image, variants, options, handle } = Astro.props;

// Separate size and price options
const sizeOption = options.find(o => o.name.toLowerCase() === 'size');
const priceOption = options.find(o => o.name.toLowerCase() === 'price' || o.name.toLowerCase() === 'tier');

// Get unique price tiers (deduplicated)
const priceTiers = priceOption?.values ?? [...new Set(variants.map(v => v.price.amount))].map(a => `$${parseFloat(a)}`);
---

<div class="product-card bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] flex flex-col" data-product={handle}>
  {image && (
    <div class="aspect-square overflow-hidden bg-[#111111]">
      <img
        src={image.url}
        alt={image.altText ?? title}
        width={image.width}
        height={image.height}
        class="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  )}

  <div class="p-6 flex flex-col flex-1 gap-4">
    <h3 class="text-[#e8e8e8] font-bold text-lg tracking-[-0.01em]">{title}</h3>
    <p class="text-[#a3a3a3] text-sm leading-relaxed">{description}</p>

    {/* Size selector (T-shirt only) */}
    {sizeOption && (
      <div>
        <p class="label-mono-compact text-[#737373] mb-2">Size</p>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label={`${title} size`}>
          {sizeOption.values.map((size, i) => (
            <button
              type="button"
              role="radio"
              aria-checked={i === 0 ? 'true' : 'false'}
              data-option="size"
              data-value={size}
              class:list={[
                'option-btn px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] border transition-colors cursor-pointer',
                i === 0
                  ? 'border-[#dc2626] text-white bg-[rgba(220,38,38,0.15)]'
                  : 'border-[rgba(255,255,255,0.12)] text-[#a3a3a3] hover:text-white hover:border-[rgba(255,255,255,0.25)] bg-transparent'
              ]}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Price tier selector */}
    <div>
      <p class="label-mono-compact text-[#737373] mb-2">Pay what you want</p>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label={`${title} price`}>
        {priceOption?.values.map((tier, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={i === 0 ? 'true' : 'false'}
            data-option="price"
            data-value={tier}
            class:list={[
              'option-btn px-4 py-2 text-xs font-bold tracking-[0.04em] border transition-colors cursor-pointer',
              i === 0
                ? 'border-[#dc2626] text-white bg-[rgba(220,38,38,0.15)]'
                : 'border-[rgba(255,255,255,0.12)] text-[#a3a3a3] hover:text-white hover:border-[rgba(255,255,255,0.25)] bg-transparent'
            ]}
          >
            {tier}
          </button>
        ))}
      </div>
    </div>

    {/* Add to Cart button */}
    <button
      type="button"
      data-add-to-cart
      data-variants={JSON.stringify(variants)}
      class="mt-auto bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs uppercase tracking-[0.08em] px-6 py-3.5 transition-colors cursor-pointer"
    >
      Add to Cart
    </button>
  </div>
</div>
```

**Step 2: Create the Shop page**

```astro
---
// src/pages/shop.astro
import Base from '../layouts/Base.astro';
import ProductCard from '../components/ProductCard.astro';
import { getProducts } from '../lib/shopify';
import shopConfig from '../data/shop-config.json';

let products: Awaited<ReturnType<typeof getProducts>> = [];
try {
  products = await getProducts();
} catch (err) {
  console.error('Failed to fetch Shopify products:', err);
}

const shopDomain = import.meta.env.SHOPIFY_STORE_DOMAIN;
const storefrontToken = import.meta.env.SHOPIFY_STOREFRONT_TOKEN;
---

<Base
  title="Shop — DeflockSC"
  description="Buy merch and yard signs to fund the DeflockSC signage campaign. Every dollar puts a 'Big Brother Is Watching' sign in front of a Flock camera."
>
  <section class="bg-[#111111] min-h-screen">
    {/* Campaign header */}
    <div class="max-w-6xl mx-auto px-6 md:px-12 pt-16 pb-8">
      <p data-reveal="left" class="label-mono-heading mb-4">Support the campaign</p>
      <h1 data-reveal="left" data-reveal-delay="1" class="text-[#e8e8e8] font-bold text-[clamp(2rem,4vw,3.5rem)] tracking-[-0.03em] leading-[1.05] mb-6">
        {shopConfig.campaignHeadline}
      </h1>
      <p data-reveal="up" data-reveal-delay="2" class="text-[#d4d4d4] text-lg leading-relaxed max-w-2xl mb-3">
        {shopConfig.campaignBlurb}
      </p>
      <p data-reveal="up" data-reveal-delay="3" class="text-[#a3a3a3] text-base leading-relaxed max-w-2xl">
        {shopConfig.transparencyNote}
      </p>
    </div>

    {/* Fundraising progress bar */}
    <div class="max-w-6xl mx-auto px-6 md:px-12 pb-12">
      <div
        data-reveal="up"
        id="progress-bar-container"
        class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] p-6"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="label-mono-compact text-[#737373]">
            Batch <span id="progress-batch">{shopConfig.batchNumber}</span> Progress
          </p>
          <p class="text-[#e8e8e8] font-bold text-sm">
            <span id="progress-raised" class="text-[#dc2626]">$0</span>
            <span class="text-[#737373]"> / </span>
            <span id="progress-goal">${shopConfig.batchTarget.toLocaleString()}</span>
          </p>
        </div>
        <div class="w-full h-3 bg-[#0d0d0d] rounded-full overflow-hidden">
          <div
            id="progress-fill"
            class="h-full bg-[#dc2626] rounded-full transition-[width] duration-1000 ease-out"
            style="width: 0%"
            role="progressbar"
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={shopConfig.batchTarget}
            aria-label="Fundraising progress"
          ></div>
        </div>
      </div>
    </div>

    {/* Product grid */}
    <div class="max-w-6xl mx-auto px-6 md:px-12 pb-12">
      {products.length > 0 ? (
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard
              title={product.title}
              description={product.description}
              image={product.featuredImage}
              variants={product.variants}
              options={product.options}
              handle={product.handle}
            />
          ))}
        </div>
      ) : (
        <p class="text-[#737373] text-center py-12">Products coming soon.</p>
      )}
    </div>

    {/* Shipping & returns */}
    <div class="max-w-6xl mx-auto px-6 md:px-12 pb-20">
      <div class="border-t border-[rgba(255,255,255,0.07)] pt-8 grid md:grid-cols-2 gap-6 text-sm text-[#737373]">
        <div>
          <p class="label-mono-compact text-[#a3a3a3] mb-2">Shipping</p>
          <p>{shopConfig.shippingNote}</p>
        </div>
        <div>
          <p class="label-mono-compact text-[#a3a3a3] mb-2">Returns</p>
          <p>{shopConfig.returnsNote}</p>
        </div>
      </div>
    </div>
  </section>

  {/* Product JSON-LD */}
  {products.map(product => {
    const prices = product.variants.map(v => parseFloat(v.price.amount));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    return (
      <script type="application/ld+json" set:html={JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.title,
        "description": product.description,
        "image": product.featuredImage?.url,
        "offers": {
          "@type": "AggregateOffer",
          "lowPrice": minPrice.toFixed(2),
          "highPrice": maxPrice.toFixed(2),
          "priceCurrency": "USD",
          "availability": product.variants.some(v => v.availableForSale)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock"
        }
      })} />
    );
  })}

  {/* Shopify Buy Button SDK + cart/progress client scripts */}
  <script
    id="shop-data"
    type="application/json"
    set:html={JSON.stringify({
      shopDomain,
      storefrontToken,
      batchTarget: shopConfig.batchTarget,
      batchNumber: shopConfig.batchNumber,
      batchStartRevenue: shopConfig.batchStartRevenue,
    })}
  />
</Base>
```

**Step 3: Commit**

```bash
git add src/components/ProductCard.astro src/pages/shop.astro
git commit -m "feat: add shop page with product cards and progress bar"
```

---

### Task 7: Create shop client-side script (cart + progress bar + selectors)

**Files:**
- Create: `src/scripts/shop.ts`

**Step 1: Write the client-side script**

```typescript
// src/scripts/shop.ts
// Client-side logic: option selectors, Shopify Buy Button SDK cart, progress bar

// ── Data island ──
const dataEl = document.getElementById('shop-data');
if (!dataEl) throw new Error('Missing #shop-data');
const config = JSON.parse(dataEl.textContent!);

// ── Option selectors (size + price button rows) ──
document.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
  card.querySelectorAll<HTMLElement>('[role="radiogroup"]').forEach(group => {
    const buttons = group.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => {
          b.setAttribute('aria-checked', 'false');
          b.classList.remove('border-[#dc2626]', 'text-white', 'bg-[rgba(220,38,38,0.15)]');
          b.classList.add('border-[rgba(255,255,255,0.12)]', 'text-[#a3a3a3]', 'bg-transparent');
        });
        btn.setAttribute('aria-checked', 'true');
        btn.classList.add('border-[#dc2626]', 'text-white', 'bg-[rgba(220,38,38,0.15)]');
        btn.classList.remove('border-[rgba(255,255,255,0.12)]', 'text-[#a3a3a3]', 'bg-transparent');
      });
    });
  });
});

// ── Resolve selected variant from button state ──
function getSelectedVariantId(card: HTMLElement): string | null {
  const variants = JSON.parse(card.querySelector<HTMLElement>('[data-add-to-cart]')!.dataset.variants!);

  // Collect selected options
  const selected: Record<string, string> = {};
  card.querySelectorAll<HTMLButtonElement>('[role="radio"][aria-checked="true"]').forEach(btn => {
    const optionName = btn.dataset.option!;
    selected[optionName] = btn.dataset.value!;
  });

  // Find matching variant
  const match = variants.find((v: any) =>
    v.selectedOptions.every((opt: any) =>
      selected[opt.name.toLowerCase()] === opt.value
    )
  );

  return match?.id ?? null;
}

// ── Shopify Buy Button SDK (cart only) ──
let shopifyClient: any = null;
let shopifyUI: any = null;

function loadShopifySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ShopifyBuy?.UI) { resolve(); return; }

    const script = document.createElement('script');
    script.src = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Shopify SDK'));
    document.head.appendChild(script);
  });
}

async function initShopifyCart() {
  await loadShopifySDK();

  shopifyClient = (window as any).ShopifyBuy.buildClient({
    domain: config.shopDomain,
    storefrontAccessToken: config.storefrontToken,
  });

  shopifyUI = await (window as any).ShopifyBuy.UI.onReady(shopifyClient);

  // Create cart-only component (no product rendering)
  shopifyUI.createComponent('cart', {
    options: {
      cart: {
        styles: {
          button: { 'background-color': '#dc2626', 'border-radius': '0' },
          title: { color: '#e8e8e8' },
          header: { color: '#e8e8e8' },
          lineItems: { color: '#e8e8e8' },
          subtotalText: { color: '#a3a3a3' },
          subtotal: { color: '#e8e8e8' },
          notice: { color: '#a3a3a3' },
          currency: { color: '#a3a3a3' },
          close: { color: '#a3a3a3', ':hover': { color: '#e8e8e8' } },
          empty: { color: '#a3a3a3' },
          cartScroll: { 'background-color': '#1a1a1a' },
          footer: { 'background-color': '#1a1a1a' },
        },
        text: { total: 'Subtotal', button: 'Checkout' },
        popup: false,
      },
      toggle: {
        styles: {
          toggle: {
            'background-color': '#dc2626',
            ':hover': { 'background-color': '#b91c1c' },
            'top': '80px', // below nav
          },
          count: { 'font-size': '12px' },
        },
      },
    },
  });
}

// ── Add to Cart handlers ──
document.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
  const addBtn = card.querySelector<HTMLButtonElement>('[data-add-to-cart]');
  if (!addBtn) return;

  addBtn.addEventListener('click', async () => {
    if (!shopifyUI) return;

    const variantId = getSelectedVariantId(card);
    if (!variantId) {
      console.error('No matching variant found for selected options');
      return;
    }

    // Add to the SDK cart
    const cart = shopifyUI.cart;
    await cart.model.addVariants({ id: variantId, quantity: 1 });
    cart.view.render();
    shopifyUI.toggles[0]?.view.render();
  });
});

// ── Fundraising progress bar ──
async function loadProgress() {
  const raisedEl = document.getElementById('progress-raised');
  const fillEl = document.getElementById('progress-fill');
  if (!raisedEl || !fillEl) return;

  try {
    const res = await fetch('/.netlify/functions/shop-progress');
    if (!res.ok) return;

    const data = await res.json();
    const totalRevenue = data.totalRevenue ?? 0;
    const batchProgress = totalRevenue - config.batchStartRevenue;
    const clamped = Math.max(0, Math.min(batchProgress, config.batchTarget));
    const pct = (clamped / config.batchTarget) * 100;

    raisedEl.textContent = `$${Math.round(clamped).toLocaleString()}`;
    fillEl.style.width = `${pct}%`;
    fillEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
  } catch {
    // Silently degrade — bar stays at 0
  }
}

// ── Init ──
initShopifyCart();
loadProgress();
```

**Step 2: Import the script in shop.astro**

Add before the closing `</Base>` tag in `src/pages/shop.astro`:

```astro
<script src="../scripts/shop.ts"></script>
```

**Step 3: Commit**

```bash
git add src/scripts/shop.ts src/pages/shop.astro
git commit -m "feat: add shop client script (cart SDK, selectors, progress bar)"
```

---

### Task 8: Add Shop link to navigation

**Files:**
- Modify: `src/components/Nav.astro`

**Step 1: Add Shop link to desktop nav**

In `Nav.astro`, add a "Shop" link between the Blog link and the Take Action button in the desktop nav:

```html
<a href="/shop" class="hidden md:inline text-[#a3a3a3] hover:text-white font-bold text-xs uppercase tracking-[0.1em] transition-colors">Shop</a>
```

Place it after the Blog `<a>` and before the `<button type="button" data-open-action ...>`.

**Step 2: Add Shop link to mobile nav**

In the `#nav-mobile-menu` div, add before the Take Action button:

```html
<a href="/shop" class="text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em] transition-colors py-2">Shop</a>
```

**Step 3: Add Shop link to footer**

In `src/components/Footer.astro`, add a Shop link to the "Explore" nav list:

```html
<li><a href="/shop" class="text-[#737373] hover:text-[#e8e8e8] transition-colors">Shop</a></li>
```

**Step 4: Commit**

```bash
git add src/components/Nav.astro src/components/Footer.astro
git commit -m "feat: add Shop link to nav and footer"
```

---

### Task 9: Update CSP headers

**Files:**
- Modify: `public/_headers`

**Step 1: Update the Content-Security-Policy**

In `public/_headers`, update the CSP header to allowlist Shopify domains:

- `script-src`: add `https://sdks.shopifycdn.com https://cdn.shopify.com`
- `style-src`: add `https://sdks.shopifycdn.com https://cdn.shopify.com`
- `img-src`: add `https://cdn.shopify.com`
- `connect-src`: add `https://*.myshopify.com https://*.shopify.com`
- Add `frame-src`: `https://*.shopify.com` (for checkout)

**Step 2: Verify by reading the updated file**

Confirm the CSP string is well-formed (no missing semicolons between directives).

**Step 3: Commit**

```bash
git add public/_headers
git commit -m "feat: update CSP to allow Shopify domains"
```

---

### Task 10: Update .env.example and verify build

**Files:**
- Modify: `.env.example`

**Step 1: Ensure .env has real tokens**

Verify `.env` contains:
```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_TOKEN=xxxxx
```

**Step 2: Run build**

Run: `npm run build`

Expected: Build succeeds. If Shopify tokens are configured, products are fetched. If not, the page renders with "Products coming soon."

**Step 3: Run dev server and verify in browser**

Run: `npm run dev` → visit `http://localhost:4321/shop`

Verify:
- Campaign header renders with blurb + transparency note
- Progress bar renders (may show $0 if no orders yet)
- Product cards render with images, size selectors, price tier selectors
- Button selectors toggle correctly (visual state change)
- Cart icon appears (Shopify SDK loaded)
- "Add to Cart" adds item to cart widget
- Nav has Shop link
- Footer has Shop link

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build/preview issues"
```

---

### Task 11: Test mobile layout

**Step 1: Open dev preview at mobile width**

Use the existing `public/dev-preview.html` or resize browser to 375px.

**Step 2: Verify mobile layout**

- Product grid is single column
- Price/size buttons wrap properly
- Cart widget doesn't overlap nav
- Progress bar is readable
- Campaign text doesn't overflow

**Step 3: Fix any responsive issues**

Commit fixes if needed.

---

### Task 12: Final review and cleanup

**Step 1: Run `npm run build` one final time**

Expected: Clean build, no warnings.

**Step 2: Verify no console errors in browser**

Open `/shop` in dev, check browser console for errors.

**Step 3: Verify CSP isn't blocking anything**

Look for CSP violation errors in console. Fix if present.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: shop page final cleanup"
```

---

## Dependency Chain

```
Task 1 (Shopify setup — user) → Task 2 (env config) → Task 3 (API utility) → Task 6 (page + cards)
Task 4 (shop config) → Task 6
Task 5 (Netlify Function) → Task 7 (client script needs progress endpoint)
Task 6 → Task 7 (client script needs page DOM)
Task 8 (nav links) — independent
Task 9 (CSP) — independent, but must be done before Task 10 testing
Task 10 (build verify) → Task 11 (mobile) → Task 12 (final)
```

Tasks 4, 5, 8, and 9 can be done in parallel. Tasks 2 → 3 → 6 → 7 are sequential.
