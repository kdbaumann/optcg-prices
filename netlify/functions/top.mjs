// netlify/functions/top.mjs
//
// /api/top?set=op-01           — current top-10 by price for that set
// /api/top?set=op-01&date=...  — top-10 as of that historical date
// /api/top?set=all             — top across all sets (default n=25)
//
// Builds the top-N list from a snapshot (today's live `prices` if no date
// given, or `prices-YYYY-MM-DD` if specified). Used by:
//   • Front-end renderer for the fluid "top of set" lists
//   • Future charts that want to show how top-10 composition shifted over time
//
// Query params:
//   set       — required. Either kebab-case set id (op-01, eb-04, etc.),
//               'all', or 'promo' for tournament/promo cards.
//   date      — optional YYYY-MM-DD. Defaults to today (live).
//   n         — top-N count (default 10, range 1-100)

import { getStore } from '@netlify/blobs';

function priceNum(s) {
  if (s == null) return NaN;
  const matches = String(s).match(/\$\s*[\d,]+(?:\.\d+)?/g) || [];
  let max = 0;
  for (const m of matches) {
    const n = parseFloat(m.replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max : NaN;
}

export default async (req) => {
  const url    = new URL(req.url);
  const setKey = (url.searchParams.get('set')  || '').toLowerCase().trim();
  const date   = (url.searchParams.get('date') || '').trim();
  const n      = Math.max(1, Math.min(100, parseInt(url.searchParams.get('n') || '10', 10)));

  if (!setKey || !/^(op-\d+|eb-\d+|prb-\d+|all|promo)$/.test(setKey)) {
    return new Response(JSON.stringify({
      error: 'Missing or invalid `set` parameter. Expected e.g. op-01, eb-04, all, promo.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({
      error: 'Invalid `date` parameter. Expected YYYY-MM-DD.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const store = getStore('card-prices');
  let snap, source;

  if (date) {
    snap = await store.get(`prices-${date}`, { type: 'json' });
    source = `snapshot ${date}`;
    if (!snap) {
      return new Response(JSON.stringify({
        error:  `No snapshot for ${date} (snapshots only started accumulating recently).`,
        source,
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } else {
    snap = await store.get('prices', { type: 'json' });
    source = 'live (latest scrape)';
    if (!snap) {
      return new Response(JSON.stringify({
        error: 'No price data available — daily scrape may not have run yet.',
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Build candidate code list:
  //   - set=all → every code in the snapshot
  //   - set=<bucket> → use _bySet[bucket] if present; otherwise filter by prefix
  let candidates;
  if (setKey === 'all') {
    candidates = Object.keys(snap).filter(k => !k.startsWith('_'));
  } else if (snap._bySet && snap._bySet[setKey]) {
    candidates = snap._bySet[setKey];
  } else {
    // _bySet missing (e.g. snapshot is the stripped daily format that only
    // keeps `code → en`). Fall back to a prefix filter that handles the
    // common case (op-01 → matches OP01-*).
    const pfx = setKey.toUpperCase().replace(/-/, '');
    candidates = Object.keys(snap).filter(k =>
      !k.startsWith('_') && k.startsWith(pfx + '-')
    );
  }

  // Resolve each code's price. Snapshot entries can be either a string
  // ("$76" — daily compact shape) or an object ({ en, updated, source }
  // — live `prices` shape).
  const items = [];
  for (const code of candidates) {
    const v = snap[code];
    if (!v) continue;
    const enStr = typeof v === 'string' ? v : v.en;
    if (!enStr) continue;
    const price = priceNum(enStr);
    if (!Number.isFinite(price) || price <= 0) continue;
    items.push({ code, en: enStr, price });
  }
  items.sort((a, b) => b.price - a.price);
  const top = items.slice(0, n).map(({ code, en, price }) => ({ code, en, price }));

  return new Response(JSON.stringify({
    set:        setKey,
    date:       date || null,
    source,
    n,
    totalCandidates: items.length,
    top,
  }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=600',
    },
  });
};

export const config = { path: '/api/top' };
