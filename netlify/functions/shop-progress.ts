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
        'Cache-Control': 'public, max-age=300',
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
