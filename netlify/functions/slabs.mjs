// netlify/functions/slabs.mjs
// Serves the slab-price feed (filled by update-slab-prices.mjs) at /api/slabs.

import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store = getStore('card-slab-prices');
    const data  = await store.get('slabs', { type: 'json' });

    if (!data) {
      return new Response(JSON.stringify({ _status: 'not_ready' }), {
        status: 200,
        headers: {
          'Content-Type':              'application/json',
          'Cache-Control':             'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type':              'application/json',
        'Cache-Control':             'public, max-age=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Slabs-Updated':           data._updated || 'unknown',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ _status: 'error', _message: err.message }), {
      status: 200,
      headers: {
        'Content-Type':              'application/json',
        'Cache-Control':             'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const config = { path: '/api/slabs' };
