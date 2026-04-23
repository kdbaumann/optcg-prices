// netlify/functions/prices.mjs
// ─────────────────────────────────────────────────────────────────────────────
// HTTP function — serves the current price data from Netlify Blobs.
// Called by the frontend on every page load via: fetch('/.netlify/functions/prices')
//
// Returns JSON with all card prices, a timestamp, and a cache header so
// browsers only hit this function once per hour.
// ─────────────────────────────────────────────────────────────────────────────

import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store = getStore('card-prices');
    const data  = await store.get('prices', { type: 'json' });

    if (!data) {
      // No prices have been written yet (first deploy, function hasn't run)
      return new Response(JSON.stringify({ _status: 'not_ready' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Short cache — check again in 5 minutes
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 1 hour — matches the daily update schedule
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Prices-Updated': data._updated || 'unknown',
      },
    });

  } catch (err) {
    console.error('[prices] Failed to read from Blobs:', err.message);
    // Return empty — frontend will use its static baked-in prices
    return new Response(JSON.stringify({ _status: 'error', _message: err.message }), {
      status: 200,  // 200 so frontend doesn't treat it as a hard failure
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const config = { path: '/api/prices' };
