// netlify/functions/update-prices.mjs
// Scheduled daily 6 AM UTC — refreshes the price feed served by /api/prices.
//
// Two sources:
//
//  1. PRIMARY  — OPCardlist (https://www.opcardlist.com/<set>). Server-rendered
//     Next.js / RSC streaming format. Card data appears as doubly-escaped JSON:
//        \"id\":\"OP01-120_p2\",...,\"price\":{\"marketPrice\":775.7,...}
//     Covers sets indexed by OPCardlist (OP-01 to OP-13, EB-01 to EB-03,
//     PRB-01 as of mid-2026). Variant suffixes _p1/_p2/_r1/etc are preserved.
//
//  2. SECONDARY — Limitless TCG (https://onepiece.limitlesstcg.com/cards/<code>).
//     Used for two purposes:
//      a) Gap-fill: cards in sets OPCardlist hasn't indexed yet
//         (OP-14, OP-15, EB-04, PRB-02 right now). Add codes to
//         LIMITLESS_GAP_FILL when prices.js grows new chase variants in
//         those sets.
//      b) Cross-verify: a small sample of cards is fetched from Limitless
//         and compared against the OPCardlist value. Spreads >25% are
//         logged and surfaced under payload._conflicts so stale or
//         wrong-variant data shows up the next time someone looks.

import { getStore } from '@netlify/blobs';

// ── OPCardlist config ─────────────────────────────────────────────────────────

const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13',
  'eb-01','eb-02','eb-03','prb-01',
];
const SETS_EXPERIMENTAL = ['op-14','op-15','eb-04','prb-02'];
const OPCARDLIST_BASE = 'https://www.opcardlist.com';

// Doubly-escaped Next.js streaming form. Captures e.g. OP01-120 base, plus
// suffixed variants (_p1 SR Parallel, _p2 Manga Alt, _r1 PRB reprint, …).
const OPC_PRIMARY = /\\"id\\":\\"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)\\"[\s\S]{0,2500}?\\"marketPrice\\":\s*([\d.]+)/g;

// Fallback for any future format change: schema.org Product JSON-LD blocks.
const OPC_FALLBACK = /"sku":"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)"[\s\S]{0,800}?"price":\s*([\d.]+)/g;

// ── Limitless config ──────────────────────────────────────────────────────────

const LIMITLESS_BASE = 'https://onepiece.limitlesstcg.com';

// Cards in sets OPCardlist doesn't index. Match this list to chase entries in
// public/data/prices.js for the four experimental sets. When you add a new
// chase variant for OP-15 / PRB-02 in prices.js, add the code here too.
const LIMITLESS_GAP_FILL = [
  // OP-14
  'OP14-119',
  // EB-04
  'EB04-001', 'EB04-044', 'EB04-059', 'EB04-060', 'EB04-061', 'EB04-062',
  // OP-15: (no entries in prices.js yet)
  // PRB-02: (no entries in prices.js yet)
];

// A handful of cards present in BOTH OPCardlist and Limitless. Used to
// sanity-check that the two sources roughly agree. >25% spread flags as a
// _conflicts entry in the response payload.
const LIMITLESS_CROSS_VERIFY = [
  'OP01-120', 'OP05-119', 'OP07-051', 'OP09-118', 'OP13-118',
];

// Limitless markup: <a class="card-price usd" href="…tcgplayer…">$1,234.56</a>
const LIM_USD = /<a[^>]*class="card-price[^"]*usd[^"]*"[^>]*>\s*\$([\d,.]+)\s*<\/a>/g;

// ── Generic helpers ───────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (compatible; FulcrumPriceBot/1.0)';

function fmtUsd(price) {
  // Whole dollars over $100 (cents add no signal at chase levels), else 2dp.
  const display = price >= 100 ? Math.round(price) : price.toFixed(2);
  return `$${Number(display).toLocaleString('en-US')}`;
}

// ── OPCardlist fetcher ────────────────────────────────────────────────────────

async function fetchSetPrices(setCode, silent404 = false) {
  const url = `${OPCARDLIST_BASE}/${setCode}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
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
      if (results.length >= 50) return true;
    }
    return false;
  }

  if (!consume(OPC_PRIMARY)) consume(OPC_FALLBACK);
  return results;
}

// ── Limitless fetcher ─────────────────────────────────────────────────────────

// Fetches a single card detail page and returns the highest USD price across
// all variant rows on the page (which is almost always the chase variant).
// Returns null if the card doesn't exist or no prices are present.
async function fetchCardFromLimitless(code) {
  try {
    const res = await fetch(`${LIMITLESS_BASE}/cards/${code}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const prices = [...html.matchAll(LIM_USD)]
      .map(m => parseFloat(m[1].replace(/,/g, '')))
      .filter(p => Number.isFinite(p) && p > 0);
    if (prices.length === 0) return null;
    return Math.max(...prices);
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async () => {
  const started = new Date().toISOString();
  const store   = getStore('card-prices');
  const allPrices = {};
  const errors = [];

  // ── 1. PRIMARY: OPCardlist scrape, all sets in parallel ──
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
    for (const { code, price } of r.value.cards) {
      if (!allPrices[code]) allPrices[code] = { en: fmtUsd(price), updated: started, source: 'opcardlist' };
    }
    console.log(`[update-prices] ${setCode}: ${r.value.cards.length} cards`);
  }

  // ── 2a. SECONDARY (gap-fill): Limitless for sets OPCardlist doesn't have ──
  const gapResults = await Promise.allSettled(
    LIMITLESS_GAP_FILL.map(code =>
      fetchCardFromLimitless(code).then(price => ({ code, price }))
    )
  );
  let gapFilled = 0;
  for (const r of gapResults) {
    if (r.status !== 'fulfilled' || !r.value || !r.value.price) continue;
    const { code, price } = r.value;
    if (!allPrices[code]) {
      allPrices[code] = { en: fmtUsd(price), updated: started, source: 'limitless' };
      gapFilled++;
    }
  }
  console.log(`[update-prices] Limitless gap-fill: ${gapFilled}/${LIMITLESS_GAP_FILL.length}`);

  // ── 2b. SECONDARY (cross-verify): sanity-check OPCardlist values ──
  const verifyResults = await Promise.allSettled(
    LIMITLESS_CROSS_VERIFY.map(code =>
      fetchCardFromLimitless(code).then(price => ({ code, price }))
    )
  );
  const conflicts = [];
  for (const r of verifyResults) {
    if (r.status !== 'fulfilled' || !r.value || !r.value.price) continue;
    const { code, price: lim } = r.value;

    // OPCardlist's highest variant price for this card code (any suffix)
    let opcMax = 0;
    for (const k of Object.keys(allPrices)) {
      if (k !== code && !k.startsWith(code + '_')) continue;
      const v = parseFloat((allPrices[k].en || '').replace(/[$,]/g, ''));
      if (Number.isFinite(v) && v > opcMax) opcMax = v;
    }
    if (opcMax === 0) continue;

    const high = Math.max(opcMax, lim);
    const low  = Math.min(opcMax, lim);
    const spread = (high - low) / high;
    if (spread > 0.25) {
      const entry = {
        code,
        opcardlist: fmtUsd(opcMax),
        limitless:  fmtUsd(lim),
        spread:     (spread * 100).toFixed(1) + '%',
      };
      conflicts.push(entry);
      console.warn(`[update-prices] CONFLICT ${code}: OPC=${entry.opcardlist} vs Lim=${entry.limitless} (${entry.spread})`);
    }
  }

  // ── 3. Write the Blob ──
  const payload = {
    _updated:    started,
    _cardCount:  Object.keys(allPrices).length,
    _errors:     errors,
    ...(conflicts.length > 0 ? { _conflicts: conflicts } : {}),
    ...allPrices,
  };
  await store.setJSON('prices', payload);
  console.log(`[update-prices] Done. ${Object.keys(allPrices).length} prices stored, ${conflicts.length} conflicts.`);

  return new Response(
    JSON.stringify({
      status:     'ok',
      updated:    started,
      cardCount:  Object.keys(allPrices).length,
      gapFilled,
      conflicts:  conflicts.length,
      errors,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const config = { schedule: '0 6 * * *' };
