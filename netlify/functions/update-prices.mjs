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
//         exposed under payload._priceCheck as a per-variant breakdown
//         from both sources, so a human can spot stale or wrong-variant
//         entries on review.

import { getStore } from '@netlify/blobs';

// ── OPCardlist config ─────────────────────────────────────────────────────────

const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13',
  'eb-01','eb-02','eb-03','prb-01',
];
const SETS_EXPERIMENTAL = ['op-15','prb-02'];

// OPCardlist groups some content under combined URLs that don't follow the
// `/set-code` pattern. Each entry maps a URL slug to a shard function — the
// shard decides which `_bySet[...]` bucket each scraped code belongs in.
//
//   /op14-eb04        : OP-14 and EB-04 cards live here together. Shard by
//                       prefix so the renderer's per-set lookups work.
//   /promo            : 300+ EN promo / tournament variants (P-XXX, ST-XX_p1,
//                       OP01-021_p1 etc.). Lands in _bySet['promo'].
//   /other-product    : Special products (Pirates Party, etc.). Also 'promo'.
const COMBINED_PAGES = [
  {
    slug: 'op14-eb04',
    shard: (code) => code.startsWith('OP14-') ? 'op-14'
                   : code.startsWith('EB04-') ? 'eb-04'
                   : 'promo',
  },
  { slug: 'promo',         shard: () => 'promo' },
  { slug: 'other-product', shard: () => 'promo' },
];
const OPCARDLIST_BASE = 'https://www.opcardlist.com';

// Doubly-escaped Next.js streaming form. Captures e.g. OP01-120 base, plus
// suffixed variants (_p1 SR Parallel, _p2 Manga Alt, _r1 PRB reprint, …).
// Three capture groups: card id, name (optional, may be absent), market price.
const OPC_PRIMARY = /\\"id\\":\\"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)\\"(?:[\s\S]{0,400}?\\"name\\":\\"([^"]+?)\\")?[\s\S]{0,2500}?\\"marketPrice\\":\s*([\d.]+)/g;

// Fallback for any future format change: schema.org Product JSON-LD blocks.
// Two capture groups: sku, price. (No name in fallback path.)
const OPC_FALLBACK = /"sku":"([A-Z0-9]+-\d+(?:_[a-zA-Z]\d+)?)"[\s\S]{0,800}?"price":\s*([\d.]+)/g;

// ── Limitless config ──────────────────────────────────────────────────────────

const LIMITLESS_BASE = 'https://onepiece.limitlesstcg.com';

// Cards in sets OPCardlist doesn't index. Add codes here ONLY when we've
// verified that Limitless's `/cards/<code>` page actually carries the chase
// variant that prices.js stores under that code.
//
// EB-04 chase cards (EB04-001 SP Gold, EB04-061 SEC Manga, etc.) are NOT in
// this list because Limitless's pages for those codes only show the base
// print and OP-15 reprint — not the EB-04 SP Gold / SEC chase variants.
// Including them would replace the curated $800/$600 chase prices with
// low-tier ($58/$44) values on the live site. Until a reliable mapping
// exists for EB-04 chase variants, those entries stay manually curated in
// public/data/prices.js.
//
// OP14-119 (Mihawk Manga) IS reliable: Limitless's v=2 row matches the
// _p2 Manga Alt variant prices.js stores, just at a different price point
// (genuine market movement, picked up by live-prices.js's magnitude check).
const LIMITLESS_GAP_FILL = [
  'OP14-119',
];

// A handful of cards present in BOTH OPCardlist and Limitless. For each, the
// function publishes the full per-variant price breakdown from each source
// under payload._priceCheck. No auto-flagging — Limitless rows are labeled by
// set/print name while OPCardlist data is keyed by _pN/_rN suffix, which
// makes apples-to-apples mapping unreliable. Review by hand.
const LIMITLESS_CROSS_VERIFY = [
  'OP01-120', 'OP05-119', 'OP07-051', 'OP09-118', 'OP13-118',
];

// Limitless markup: <a class="card-price usd" href="…tcgplayer…">$1,234.56</a>
const LIM_USD = /<a[^>]*class="card-price[^"]*usd[^"]*"[^>]*>\s*\$([\d,.]+)\s*<\/a>/g;

// One <tr> on Limitless = one variant. We pull (price, vparam, set/print label).
const LIM_TR  = /<tr[^>]*>([\s\S]*?)<\/tr>/g;

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

  // Names captured from OPCardlist's RSC stream are doubly-escaped (raw text
  // contains literal "\\", "\\'", "\\u2606", etc.). Unescape so the renderer
  // gets readable text — otherwise we'd ship "Eustass\\\\" to the client.
  function unescapeRsc(s) {
    if (!s) return s;
    return s
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, "'")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\.([A-Z])/g, ' $1')      // "Monkey.D.Luffy" → "Monkey D Luffy"
      .replace(/\\$/, '')                // strip a trailing lone backslash ("Eustass\\")
      .trim();
  }

  function consume(pattern, hasName) {
    for (const m of html.matchAll(pattern)) {
      const code  = m[1] && m[1].trim();
      if (!code || seen.has(code)) continue;
      const name  = hasName ? unescapeRsc(m[2] || '') : '';
      const price = parseFloat(hasName ? m[3] : m[2]);
      // Keep everything with a real positive price. Was filtered to >= $10
      // (chase-variants only), but historical analysis + fluid top-10 needs
      // every code OPCardlist publishes — bulk commons rotate into chase
      // status sometimes (meta shifts, character popularity), and either way
      // we want a continuous time series. ~3000 codes total at ~400KB/day.
      if (!Number.isFinite(price) || price <= 0) continue;
      seen.add(code);
      results.push({ code, price, name });
      // Per-page safety cap. With the filter dropped, OP-set pages return
      // ~150 codes each and /promo returns ~340; total per page ≤ 600.
      if (results.length >= 1000) return true;
    }
    return false;
  }

  if (!consume(OPC_PRIMARY, true)) consume(OPC_FALLBACK, false);
  return results;
}

// ── Limitless fetcher ─────────────────────────────────────────────────────────

// Returns the raw HTML of a Limitless card page (or '' on failure).
async function fetchLimitlessHtml(code) {
  try {
    const res = await fetch(`${LIMITLESS_BASE}/cards/${code}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

// Walks each <tr> on a Limitless card page and returns one entry per variant:
// { price, vparam, label }. label is the print/set name (e.g. "Romance Dawn",
// "Prize Cards", "One Piece The Best"). vparam is "v=N" or "base".
// Returns [] if the card doesn't exist on Limitless.
function parseLimitlessVariants(html) {
  if (!html) return [];
  const out = [];
  for (const trMatch of html.matchAll(LIM_TR)) {
    const row = trMatch[1];
    if (!row.includes('card-price') || !row.includes('$')) continue;
    const usd = row.match(/<a[^>]*class="card-price[^"]*usd[^"]*"[^>]*>\s*\$([\d,.]+)/);
    if (!usd) continue;
    const price = parseFloat(usd[1].replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    const v = row.match(/\?v=(\d+)/);
    const labelM = row.match(/<a[^>]*>\s*([^<]+?)\s*</);
    let label = labelM ? labelM[1] : '';
    label = label.replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
    out.push({
      vparam: v ? `v=${v[1]}` : 'base',
      label,
      price,
    });
  }
  return out;
}

// Convenience: max USD price across all variants on a Limitless card page.
async function fetchCardMaxFromLimitless(code) {
  const html = await fetchLimitlessHtml(code);
  const variants = parseLimitlessVariants(html);
  if (variants.length === 0) return null;
  return Math.max(...variants.map(v => v.price));
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

  // Per-set membership index. Lets the front-end renderer ask "what cards
  // are in this set, sorted by current price?" without re-scraping. Set
  // codes are kebab-case (op-13, eb-04) — front-end normalizes when
  // looking up a section id like 'op13'.
  const bySet = {};

  for (let i = 0; i < settled.length; i++) {
    const { setCode } = tasks[i];
    const r = settled[i];
    if (r.status === 'rejected') {
      errors.push({ set: setCode, error: (r.reason && r.reason.message) || String(r.reason) });
      console.error(`[update-prices] ERROR ${setCode}: ${errors[errors.length - 1].error}`);
      continue;
    }
    bySet[setCode] = r.value.cards.map(c => c.code);
    for (const { code, price, name } of r.value.cards) {
      if (!allPrices[code]) {
        allPrices[code] = { en: fmtUsd(price), updated: started, source: 'opcardlist' };
        if (name) allPrices[code].name = name;
      } else if (name && !allPrices[code].name) {
        // Same code seen in multiple set scrapes — keep first price, but pick up
        // a name on a later pass if the earlier one didn't have it.
        allPrices[code].name = name;
      }
    }
    console.log(`[update-prices] ${setCode}: ${r.value.cards.length} cards`);
  }

  // ── 1b. EXTRAS: combined-set pages (/op14-eb04, /promo, /other-product) ──
  // OPCardlist serves these under non-standard slugs. Each scraped code is
  // sharded into the proper _bySet bucket by its prefix, so the front-end's
  // per-set renderer finds them transparently (e.g. OP14-051_p1 lands in
  // _bySet['op-14'] just as if /op-14 had returned it).
  const extraSettled = await Promise.allSettled(
    COMBINED_PAGES.map(({ slug }) =>
      fetchSetPrices(slug, false).then(cards => ({ slug, cards }))
    )
  );
  for (let i = 0; i < extraSettled.length; i++) {
    const { slug, shard } = COMBINED_PAGES[i];
    const r = extraSettled[i];
    if (r.status === 'rejected') {
      errors.push({ set: slug, error: (r.reason && r.reason.message) || String(r.reason) });
      console.error(`[update-prices] ERROR ${slug}: ${errors[errors.length - 1].error}`);
      continue;
    }
    let sharded = 0;
    for (const { code, price, name } of r.value.cards) {
      const bucket = shard(code);
      if (!bySet[bucket]) bySet[bucket] = [];
      // Avoid duplicate entries in the bucket (a code may legitimately appear
      // in both /promo and /other-product, or in /op14-eb04 alongside being
      // shared as a promo).
      if (!bySet[bucket].includes(code)) bySet[bucket].push(code);
      if (!allPrices[code]) {
        allPrices[code] = { en: fmtUsd(price), updated: started, source: 'opcardlist' };
        if (name) allPrices[code].name = name;
        sharded++;
      } else if (name && !allPrices[code].name) {
        allPrices[code].name = name;
      }
    }
    console.log(`[update-prices] /${slug}: ${r.value.cards.length} cards (${sharded} new)`);
  }

  // ── 2a. SECONDARY (gap-fill): Limitless for sets OPCardlist doesn't have ──
  const gapResults = await Promise.allSettled(
    LIMITLESS_GAP_FILL.map(code =>
      fetchCardMaxFromLimitless(code).then(price => ({ code, price }))
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

  // ── 2b. SECONDARY (cross-verify): full variant breakdown from both sources ──
  // We do NOT auto-flag "conflicts" — variant ↔ variant matching across the
  // two sources is unreliable (Limitless rows are labeled by set/print name,
  // OPCardlist data is keyed by _pN/_rN suffix). Instead we publish the full
  // breakdown under payload._priceCheck so a human can compare per variant.
  const verifyHtmls = await Promise.allSettled(
    LIMITLESS_CROSS_VERIFY.map(code =>
      fetchLimitlessHtml(code).then(html => ({ code, html }))
    )
  );
  const priceCheck = [];
  for (const r of verifyHtmls) {
    if (r.status !== 'fulfilled') continue;
    const { code, html } = r.value;
    const limVariants = parseLimitlessVariants(html);
    if (limVariants.length === 0) continue;

    const opcVariants = {};
    for (const k of Object.keys(allPrices)) {
      if (k === code || k.startsWith(code + '_')) {
        opcVariants[k] = allPrices[k].en;
      }
    }
    priceCheck.push({
      code,
      opcardlist: opcVariants,
      limitless: limVariants.map(v => ({
        vparam: v.vparam,
        label:  v.label,
        price:  fmtUsd(v.price),
      })),
    });
    console.log(`[update-prices] price-check ${code}: ${Object.keys(opcVariants).length} OPC variants, ${limVariants.length} Lim variants`);
  }

  // ── 3. Write the Blob ──
  const payload = {
    _updated:    started,
    _cardCount:  Object.keys(allPrices).length,
    _errors:     errors,
    _bySet:      bySet,
    ...(priceCheck.length > 0 ? { _priceCheck: priceCheck } : {}),
    ...allPrices,
  };
  await store.setJSON('prices', payload);

  // ── 4. Historical snapshot (for week-over-week mover analysis) ──
  // Keyed by ISO date — `prices-YYYY-MM-DD`. The buy-analysis tab queries
  // /api/movers which diffs today against a snapshot ~7 days old. We store
  // a stripped-down version (just code → en) to keep each snapshot compact;
  // ~70KB compressed × 30 days = ~2MB total, well within Blob limits.
  const snapDate = started.slice(0, 10);       // '2026-05-13'
  const snapshot = { _updated: started };
  for (const [code, entry] of Object.entries(allPrices)) {
    if (entry && entry.en) snapshot[code] = entry.en;
  }
  await store.setJSON(`prices-${snapDate}`, snapshot);

  console.log(`[update-prices] Done. ${Object.keys(allPrices).length} prices stored, ${priceCheck.length} cards price-checked, snapshot prices-${snapDate} saved.`);

  return new Response(
    JSON.stringify({
      status:      'ok',
      updated:     started,
      cardCount:   Object.keys(allPrices).length,
      gapFilled,
      priceCheck:  priceCheck.length,
      errors,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const config = { schedule: '0 6 * * *' };
