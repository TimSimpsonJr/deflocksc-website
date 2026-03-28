// src/lib/shop-utils.ts
// Shared product grouping logic for shop index and detail pages

import type { ShopifyProduct } from './shopify';

export interface Tier {
  price: number;
  label: string;
  variants: ShopifyProduct['variants'];
  handle: string;
}

export interface ProductGroup {
  baseName: string;
  slug: string;
  description: string;
  descriptionHtml: string;
  image: ShopifyProduct['featuredImage'];
  images: ShopifyProduct['images'];
  options: ShopifyProduct['options'];
  tiers: Tier[];
  hasTiers: boolean;
}

const TIER_OPTION_NAMES = ['tier', 'price', 'sponsorship tier'];

export function groupProducts(
  products: ShopifyProduct[],
  tierLabels: Record<string, string>,
  productOrder?: string[],
): ProductGroup[] {
  const groupMap = new Map<string, ProductGroup>();

  for (const product of products) {
    const baseName = product.title.replace(/\s*-?\s*\$\d+$/, '').trim();
    const priceMatch = product.title.match(/\$(\d+)$/);
    const price = priceMatch ? parseInt(priceMatch[1]) : 0;

    // Derive a slug from the base name (strip price suffix from handle too)
    const slug = product.handle.replace(/-?\d+$/, '').replace(/-$/, '') || product.handle;

    if (!groupMap.has(baseName)) {
      const tierOption = product.options.find(o =>
        TIER_OPTION_NAMES.includes(o.name.toLowerCase())
      );

      groupMap.set(baseName, {
        baseName,
        slug,
        description: product.description,
        descriptionHtml: product.descriptionHtml,
        image: product.featuredImage,
        images: product.images,
        options: tierOption
          ? product.options.filter(o => o !== tierOption)
          : product.options,
        tiers: [],
        hasTiers: false,
      });

      if (tierOption) {
        const group = groupMap.get(baseName)!;
        group.hasTiers = true;
        for (const tierValue of tierOption.values) {
          const tierPriceMatch = tierValue.match(/\$(\d+)/);
          const tierPrice = tierPriceMatch ? parseInt(tierPriceMatch[1]) : 0;
          const tierVariants = product.variants.filter(v =>
            v.selectedOptions.some(o =>
              TIER_OPTION_NAMES.includes(o.name.toLowerCase()) && o.value === tierValue
            )
          );
          group.tiers.push({
            price: tierPrice,
            label: tierLabels[String(tierPrice)] ?? tierValue.replace(/^\$\d+\s*[-—]\s*/, ''),
            variants: tierVariants,
            handle: product.handle,
          });
        }
      }
    }

    if (priceMatch) {
      const group = groupMap.get(baseName)!;
      group.hasTiers = true;
      group.tiers.push({
        price,
        label: tierLabels[String(price)] ?? `$${price}`,
        variants: product.variants,
        handle: product.handle,
      });
    }

    const group = groupMap.get(baseName)!;
    if (!priceMatch && !group.hasTiers && group.tiers.length === 0) {
      const firstVariant = product.variants[0];
      const variantPrice = firstVariant ? parseFloat(firstVariant.price.amount) : 0;
      group.tiers.push({
        price: variantPrice,
        label: '',
        variants: product.variants,
        handle: product.handle,
      });
    }
  }

  return [...groupMap.values()]
    .map(g => ({
      ...g,
      tiers: g.tiers.sort((a, b) => a.price - b.price),
    }))
    .sort((a, b) => {
      if (!productOrder) return 0;
      const aIdx = productOrder.findIndex(name => a.baseName.includes(name));
      const bIdx = productOrder.findIndex(name => b.baseName.includes(name));
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
}

export function getPriceRange(group: ProductGroup): { min: number; max: number } {
  // For tiered products, use the tier prices (the customer-facing price)
  // For non-tiered products, use the variant prices
  if (group.hasTiers) {
    const tierPrices = group.tiers.map(t => t.price).filter(p => p > 0);
    if (tierPrices.length > 0) {
      return {
        min: Math.min(...tierPrices),
        max: Math.max(...tierPrices),
      };
    }
  }

  const allPrices = group.tiers.flatMap(t =>
    t.variants.map(v => parseFloat(v.price.amount))
  );
  return {
    min: Math.min(...allPrices),
    max: Math.max(...allPrices),
  };
}

export function formatPriceRange(group: ProductGroup): string {
  const { min, max } = getPriceRange(group);
  if (min === max) return `$${min}`;
  return `$${min} – $${max}`;
}
