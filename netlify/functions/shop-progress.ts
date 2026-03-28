// netlify/functions/shop-progress.ts
// Returns total shop profit from Shopify Admin API for the progress bar
// Profit = revenue - cost of goods (from variant inventoryItem.unitCost)

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
          lineItems(first: 50) {
            edges {
              node {
                quantity
                variant {
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
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

async function fetchAllOrderProfits(): Promise<{ totalRevenue: number; totalCost: number }> {
  let totalRevenue = 0;
  let totalCost = 0;
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

      for (const lineItem of edge.node.lineItems.edges) {
        const unitCost = lineItem.node.variant?.inventoryItem?.unitCost?.amount;
        const quantity = lineItem.node.quantity;
        if (unitCost) {
          totalCost += parseFloat(unitCost) * quantity;
        }
      }
    }

    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    if (edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    }
  }

  return { totalRevenue, totalCost };
}

export default async (req: Request, context: Context) => {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { totalRevenue, totalCost } = await fetchAllOrderProfits();
    const totalProfit = Math.round((totalRevenue - totalCost) * 100) / 100;
    return new Response(JSON.stringify({ totalProfit, totalRevenue }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: any) {
    console.error('shop-progress error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch progress data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
