// netlify/functions/history.mjs
//
// /api/history?code=OP01-120     — time series of prices for a single code
// /api/history?code=OP01-120_p2  — variant time series
//
// Reads every `prices-YYYY-MM-DD` snapshot in the `card-prices` Blob store
// and returns the price for the requested code on each available date.
// Useful for charting a card's price over time or computing custom-window
// %change (movers endpoint handles the common 7-day case).
//
// Query params:
//   code      — required, full variant code
//   limit     — max number of points (default 365, range 1-1000)
//
// Returns:
//   {
//     code: "OP01-120_p2",
//     points: [
//       { date: "2026-05-13", en: "$190" },
//       { date: "2026-05-12", en: "$185" },
//       ...
//     ],
//     _count: 12,
//     _firstDate: "2026-05-02",
//     _lastDate:  "2026-05-13"
//   }

import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url   = new URL(req.url);
  const code  = (url.searchParams.get('code') || '').trim().toUpperCase();
  const limit = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit') || '365', 10)));

  if (!code || !/^[A-Z0-9-]+(_p\d+|_r\d+)?$/.test(code)) {
    return new Response(JSON.stringify({
      error: 'Missing or invalid `code` parameter. Expected e.g. OP01-120 or OP01-120_p2.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const store = getStore('card-prices');

  // List all snapshot keys.
  // Netlify Blobs list() returns { blobs: [{ key, etag, ... }, ...] }
  let blobs;
  try {
    const result = await store.list({ prefix: 'prices-' });
    blobs = (result && result.blobs) || [];
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Could not list snapshots: ' + (e.message || e),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Filter to dated snapshots only and sort by date descending (newest first).
  const dated = blobs
    .map(b => b.key)
    .filter(k => /^prices-\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .reverse()
    .slice(0, limit);

  // Fetch each snapshot in parallel and extract this card's price.
  const points = await Promise.all(dated.map(async key => {
    try {
      const snap = await store.get(key, { type: 'json' });
      if (!snap) return null;
      const en = snap[code];
      if (!en) return null;
      // Snapshot stores `en` as a string ("$76", "$30–$60"). Older versions
      // may have stored the full entry object — handle both shapes.
      const enStr = typeof en === 'string' ? en : (en.en || null);
      if (!enStr) return null;
      return {
        date: key.replace(/^prices-/, ''),
        en:   enStr,
      };
    } catch {
      return null;
    }
  }));

  const filtered = points.filter(p => p !== null);
  filtered.sort((a, b) => b.date.localeCompare(a.date));  // newest first

  return new Response(JSON.stringify({
    code,
    points:     filtered,
    _count:     filtered.length,
    _firstDate: filtered.length ? filtered[filtered.length - 1].date : null,
    _lastDate:  filtered.length ? filtered[0].date : null,
  }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=600',
    },
  });
};

export const config = { path: '/api/history' };
