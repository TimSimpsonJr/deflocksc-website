// src/scripts/shop.ts
// Client-side logic: option selectors, Shopify Buy Button SDK cart, progress bar

// ── Data island ──
const dataEl = document.getElementById('shop-data');
if (!dataEl) throw new Error('Missing #shop-data');
const config = JSON.parse(dataEl.textContent!);

// ── Update button price for dynamic-price products ──
function updateButtonPrice(card: HTMLElement) {
  const addBtn = card.querySelector<HTMLButtonElement>('[data-add-to-cart]');
  if (!addBtn || addBtn.dataset.showPrice !== 'dynamic') return;

  const priceSpan = addBtn.querySelector<HTMLElement>('[data-cart-price]');
  if (!priceSpan) return;

  const tiers = JSON.parse(addBtn.dataset.tiers!);
  const sizeBtn = card.querySelector<HTMLButtonElement>('[data-option="size"][aria-checked="true"]');
  const selectedSize = sizeBtn?.dataset.value;

  if (selectedSize && tiers[0]?.variants) {
    const match = tiers[0].variants.find((v: any) =>
      v.selectedOptions.some((opt: any) =>
        opt.name.toLowerCase() === 'size' && opt.value === selectedSize
      )
    );
    if (match) {
      priceSpan.textContent = ` — $${parseFloat(match.price.amount)}`;
    }
  }
}

// ── Option selectors (size + tier button rows) ──
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
        updateButtonPrice(card);
      });
    });
  });

  // Set initial price for dynamic-price products
  updateButtonPrice(card);
});

// ── Resolve selected variant from button state ──
function getSelectedVariantId(card: HTMLElement): string | null {
  const tiers = JSON.parse(card.querySelector<HTMLElement>('[data-add-to-cart]')!.dataset.tiers!);

  // Get selected tier index
  const tierBtn = card.querySelector<HTMLButtonElement>('[data-option="tier"][aria-checked="true"]');
  const tierIndex = tierBtn ? parseInt(tierBtn.dataset.tierIndex!) : 0;
  const tier = tiers[tierIndex];
  if (!tier) return null;

  // Get selected size (if applicable)
  const sizeBtn = card.querySelector<HTMLButtonElement>('[data-option="size"][aria-checked="true"]');
  const selectedSize = sizeBtn?.dataset.value;

  // Find matching variant in the selected tier
  const match = tier.variants.find((v: any) => {
    if (!selectedSize) return true;
    return v.selectedOptions.some((opt: any) =>
      opt.name.toLowerCase() === 'size' && opt.value === selectedSize
    );
  });

  return match?.id ?? null;
}

// ── Shopify JS Buy SDK (direct checkout, no cart widget) ──
let shopifyClient: any = null;

function loadShopifySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).ShopifyBuy) { resolve(); return; }

    const script = document.createElement('script');
    script.src = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Shopify SDK'));
    document.head.appendChild(script);
  });
}

async function getClient() {
  if (shopifyClient) return shopifyClient;
  await loadShopifySDK();
  shopifyClient = (window as any).ShopifyBuy.buildClient({
    domain: config.shopDomain,
    storefrontAccessToken: config.storefrontToken,
  });
  return shopifyClient;
}

// ── Buy Now handlers (direct to Shopify checkout) ──
document.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
  const addBtn = card.querySelector<HTMLButtonElement>('[data-add-to-cart]');
  if (!addBtn) return;

  addBtn.addEventListener('click', async () => {
    const variantId = getSelectedVariantId(card);
    if (!variantId) {
      console.error('[shop] No matching variant found for selected options');
      return;
    }

    addBtn.disabled = true;
    const originalText = addBtn.textContent;
    addBtn.textContent = 'Redirecting to checkout...';

    try {
      const client = await getClient();
      const checkout = await client.checkout.create();
      const updatedCheckout = await client.checkout.addLineItems(
        checkout.id,
        [{ variantId, quantity: 1 }]
      );
      window.location.href = updatedCheckout.webUrl;
    } catch (err: any) {
      console.error('[shop] Checkout error:', err);
      addBtn.disabled = false;
      addBtn.textContent = originalText;
    }
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
    const totalProfit = data.totalProfit ?? 0;
    const batchProgress = totalProfit - config.batchStartProfit;
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
loadProgress();
