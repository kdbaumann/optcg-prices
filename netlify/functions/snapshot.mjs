// netlify/functions/snapshot.mjs
//
// /api/snapshot?date=YYYY-MM-DD
//
// Returns the full price snapshot stored on that date, in the same compact
// shape /api/prices uses ({ _updated, _bySet, CODE: '$en', ... }).
//
// Powers the renderer's "rank movement" indicators: the renderer fetches
// today's prices (already in window.LIVE_PRICES) plus one historical
// snapshot in one round-trip, computes prior ranks per set, and marks each
// rendered card with how its rank moved.

import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url  = new URL(req.url);
  const date = (url.searchParams.get('date') || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({
      error: 'Invalid `date` parameter. Expected YYYY-MM-DD.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const store = getStore('card-prices');
  const snap  = await store.get(`prices-${date}`, { type: 'json' });

  if (!snap) {
    return new Response(JSON.stringify({
      _status: 'not_found',
      _date:   date,
      _message: `No snapshot stored for ${date} — daily snapshots are still accumulating.`,
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify(snap), {
    headers: {
      'Content-Type':  'application/json',
      // Historical snapshots are immutable — cache aggressively.
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
};

export const config = { path: '/api/snapshot' };
