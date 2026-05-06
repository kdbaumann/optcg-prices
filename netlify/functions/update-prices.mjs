// netlify/functions/update-prices.mjs
// Scheduled daily 6 AM UTC — fetches market prices for every set from
// OPCardlist and stores them in the Netlify Blob the /api/prices function
// reads.
//
// OPCardlist rebuilt their site as a Next.js / React Server Components app
// in 2026. Card data is no longer in plain `data-card-id` HTML attributes;
// it now appears inside the streaming RSC payload as doubly-escaped JSON,
// e.g.  \"id\":\"OP01-120_p2\",...,\"price\":{\"marketPrice\":775.7,...}.
// We pull the marketPrice for every card on each set page.

import { getStore } from '@netlify/blobs';

const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13',
  'eb-01','eb-02','eb-03','prb-01',
];
const SETS_EXPERIMENTAL = ['op-14','op-15','eb-04','prb-02'];

// Use the canonical host directly so we don't pay for a 307 redirect on
// every request. opcardlist.com 307s to www.opcardlist.com.
const OPCARDLIST_BASE = 'https://www.opcardlist.com';

// Doubly-escaped Next.js streaming form. Captures e.g. OP01-120 base, plus
// suffixed variants (_p1 SR Parallel, _p2 Manga Alt, _r1 PRB reprint, …).
const PRIMARY_PATTERN = /\\"id\\":\\"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)\\"[\s\S]{0,2500}?\\"marketPrice\\":\s*([\d.]+)/g;

// Fallback for any future format change: schema.org Product JSON-LD blocks
// (single-escape JSON inside <script type="application/ld+json">). Lower
// coverage (chase variants are usually missing here) but better than nothing.
const FALLBACK_PATTERN = /"sku":"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)"[\s\S]{0,800}?"price":\s*([\d.]+)/g;

async function fetchSetPrices(setCode, silent404 = false) {
  const url = `${OPCARDLIST_BASE}/${setCode}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FulcrumPriceBot/1.0)' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
  });
  if (res.status === 404) {
    if (!silent404) console.log(`[update-prices] ${setCode}: not yet indexed (404)`);
    return [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const seen = new Set();
  const results = [];

  function consume(pattern) {
    for (const m of html.matchAll(pattern)) {
      const code = m[1] && m[1].trim();
      if (!code || seen.has(code)) continue;
      const price = parseFloat(m[2]);
      if (!Number.isFinite(price) || price < 10) continue;
      seen.add(code);
      results.push({ code, price });
      if (results.length >= 50) return true;     // hit cap
    }
    return false;
  }

  if (!consume(PRIMARY_PATTERN)) consume(FALLBACK_PATTERN);
  return results;
}

function fmtUsd(price) {
  // Whole dollars over $100 (cents add no signal at chase levels), else 2dp.
  const display = price >= 100 ? Math.round(price) : price.toFixed(2);
  return `$${Number(display).toLocaleString('en-US')}`;
}

export default async () => {
  const started = new Date().toISOString();
  const store   = getStore('card-prices');
  const allPrices = {};
  const errors = [];

  // Run every set fetch in parallel — OPCardlist easily handles 21 concurrent
  // GETs and the alternative (sequential, 21 × ~2s + 200ms delays) blows the
  // 10s timeout when the function is manually invoked from the dashboard.
  const tasks = [
    ...SETS.map(s => ({ setCode: s, silent: false })),
    ...SETS_EXPERIMENTAL.map(s => ({ setCode: s, silent: true })),
  ];

  const settled = await Promise.allSettled(
    tasks.map(({ setCode, silent }) =>
      fetchSetPrices(setCode, silent).then(cards => ({ setCode, cards }))
    )
  );

  for (let i = 0; i < settled.length; i++) {
    const { setCode } = tasks[i];
    const r = settled[i];
    if (r.status === 'rejected') {
      errors.push({ set: setCode, error: (r.reason && r.reason.message) || String(r.reason) });
      console.error(`[update-prices] ERROR ${setCode}: ${errors[errors.length - 1].error}`);
      continue;
    }
    const cards = r.value.cards;
    for (const { code, price } of cards) {
      if (!allPrices[code]) allPrices[code] = { en: fmtUsd(price), updated: started };
    }
    console.log(`[update-prices] ${setCode}: ${cards.length} cards`);
  }

  const payload = { _updated: started, _cardCount: Object.keys(allPrices).length, _errors: errors, ...allPrices };
  await store.setJSON('prices', payload);
  console.log(`[update-prices] Done. ${Object.keys(allPrices).length} prices stored.`);

  return new Response(
    JSON.stringify({ status: 'ok', updated: started, cardCount: Object.keys(allPrices).length, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const config = { schedule: '0 6 * * *' };
