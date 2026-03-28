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

// ── Shopify Buy Button SDK (cart only) ──
let shopifyUI: any = null;

function loadShopifySDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).ShopifyBuy?.UI) { resolve(); return; }

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

  const client = (window as any).ShopifyBuy.buildClient({
    domain: config.shopDomain,
    storefrontAccessToken: config.storefrontToken,
  });

  shopifyUI = await (window as any).ShopifyBuy.UI.onReady(client);

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
            'top': '80px',
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
initShopifyCart();
loadProgress();
