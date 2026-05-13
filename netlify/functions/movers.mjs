// netlify/functions/movers.mjs
//
// /api/movers — week-over-week price movement for the Card Analysis tab.
//
// Reads two snapshots from the `card-prices` Blob store:
//   1. Today (or the live `prices` payload if today's snapshot isn't saved yet)
//   2. ~N days ago (default 7) — falling back to the closest earlier snapshot
//      we have if the exact date wasn't saved
//
// For every code that appears in both, computes %change. Returns top gainers
// and top losers. If we don't have enough history yet (e.g., the snapshot
// system just started), returns `_status: 'warming-up'` and empty arrays so
// the front-end can show a helpful message.
//
// Query params:
//   days=N    — comparison window (default 7, range 1-30)
//   limit=N   — items per side (default 50, range 1-200)

import { getStore } from '@netlify/blobs';

const DEFAULT_WINDOW = 7;
const DEFAULT_LIMIT  = 50;

// Parse a price string ("$1,234" / "$10–$50" / "$76") → numeric (largest $-figure).
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

// ISO date string (UTC) for N days ago.
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Find the closest snapshot ≤ targetDate (looks backwards up to maxLookback days).
async function findClosestSnapshot(store, targetDate, maxLookback = 14) {
  const target = new Date(targetDate + 'T00:00:00Z');
  for (let i = 0; i <= maxLookback; i++) {
    const d = new Date(target);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `prices-${d.toISOString().slice(0, 10)}`;
    try {
      const snap = await store.get(key, { type: 'json' });
      if (snap) return { key, snapshot: snap, daysOff: i };
    } catch {}
  }
  return null;
}

export default async (req) => {
  const url    = new URL(req.url);
  const days   = Math.max(1, Math.min(30,  parseInt(url.searchParams.get('days')  || DEFAULT_WINDOW, 10)));
  const limit  = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || DEFAULT_LIMIT,  10)));
  const store  = getStore('card-prices');

  // ── Load TODAY's prices ─────────────────────────────────────────────────
  // Prefer today's dated snapshot. If the scheduled function hasn't run yet
  // today, fall back to the live `prices` payload (whatever was last stored).
  const todayDate = new Date().toISOString().slice(0, 10);
  let today = null, todayKey = null;
  try {
    today = await store.get(`prices-${todayDate}`, { type: 'json' });
    if (today) todayKey = `prices-${todayDate}`;
  } catch {}
  if (!today) {
    const live = await store.get('prices', { type: 'json' });
    if (live) {
      // The live `prices` payload has full entries ({en, updated, source, ...}).
      // Flatten to a code→en map matching snapshot shape.
      today = { _updated: live._updated };
      for (const [code, entry] of Object.entries(live)) {
        if (code.startsWith('_')) continue;
        if (entry && entry.en) today[code] = entry.en;
      }
      todayKey = 'prices (live, no snapshot for today yet)';
    }
  }

  if (!today) {
    return new Response(JSON.stringify({
      _status: 'no-data',
      _message: 'No price data available — daily scrape may not have run yet.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Load the COMPARISON snapshot ─────────────────────────────────────────
  const baseline = await findClosestSnapshot(store, daysAgo(days));
  if (!baseline) {
    return new Response(JSON.stringify({
      _status:   'warming-up',
      _message:  `Not enough history yet — need a snapshot from around ${daysAgo(days)} or earlier. Snapshots accumulate daily; check back in ${days} days.`,
      _todayKey: todayKey,
      _targetDate: daysAgo(days),
      gainers: [],
      losers:  [],
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── Diff ────────────────────────────────────────────────────────────────
  const movers = [];
  for (const [code, todayEn] of Object.entries(today)) {
    if (code.startsWith('_')) continue;
    const beforeEn = baseline.snapshot[code];
    if (!beforeEn) continue;
    const before = priceNum(beforeEn);
    const after  = priceNum(todayEn);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    if (before < 1) continue;     // ignore tiny-price noise
    const delta = after - before;
    const pct   = (delta / before) * 100;
    if (Math.abs(pct) < 1) continue;   // ignore <1% noise
    movers.push({
      code,
      before: beforeEn,
      after:  todayEn,
      pct:    Math.round(pct * 10) / 10,
      delta:  Math.round(delta * 100) / 100,
    });
  }

  movers.sort((a, b) => b.pct - a.pct);
  const gainers = movers.slice(0, limit);
  const losers  = movers.slice(-limit).reverse();

  return new Response(JSON.stringify({
    _status:      'ok',
    _todayKey:    todayKey,
    _baselineKey: baseline.key,
    _windowDays:  days,
    _actualDays:  days + baseline.daysOff,
    _matched:     movers.length,
    gainers,
    losers,
  }), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=600',
    },
  });
};

export const config = { path: '/api/movers' };
