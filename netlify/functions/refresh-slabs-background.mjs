// netlify/functions/refresh-slabs-background.mjs
//
// Scheduled daily 9 AM UTC. Background function (15-min timeout) so Claude
// has plenty of headroom for web-search-driven research.
//
// Replaces the prior eBay Browse API approach for slab prices. Claude with
// the web_search tool can disambiguate variants (manga alt vs base parallel
// vs Red SAA), pull from multiple sources (eBay sold, TCGplayer, PriceCharting,
// alt.xyz, fanaticscollect, PSA pop), and reason about thin-market cards
// where private sales dominate (Roger Gold Manga BGS 10, etc.). eBay's text
// search alone returned noise that wasn't usable.
//
// Reads ANTHROPIC_API_KEY from Netlify env vars and writes the result to
// the same `card-slab-prices/slabs` Blob the /api/slabs function reads.
//
// Cost: ~$0.10–0.50 per run with web_search. Daily = ~$30–180/year.
// To pause: change `schedule` below or remove the env var.

import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';

// One row per (card, variant). The variant suffix matches data/prices.js
// keys: '_p1' SR Parallel, '_p2' Manga Alt, '_p3' Red SAA, '_p4' TC Promo /
// stamp, '_p5'/'_p6'/'_p7'/'_p8' SP Gold / Silver anniversary, '_r1'/'_r2'
// PRB reprints. The desc field is what Claude actually searches for.
// Manually-curated targets — the most-graded chase variants that may not
// always show up in the dynamic top-N (e.g. anniversary SP Gold/Silvers
// distributed in low quantities).
const CURATED_TARGETS = [
  // ── 3rd Anniversary RED SAA (OP-13) ─────────────────────────────────────
  { code: 'OP13-118', variant: '_p3', desc: 'Monkey D. Luffy Red Super Alt Art SEC (3rd Anniversary)' },
  { code: 'OP13-119', variant: '_p3', desc: 'Portgas D. Ace Red Super Alt Art SEC (3rd Anniversary)' },
  { code: 'OP13-120', variant: '_p3', desc: 'Sabo Red Super Alt Art SEC (3rd Anniversary)' },

  // ── OP-13 Manga Alt Art ─────────────────────────────────────────────────
  { code: 'OP13-118', variant: '_p2', desc: 'Monkey D. Luffy Manga Alt Art SEC' },
  { code: 'OP13-119', variant: '_p2', desc: 'Portgas D. Ace Manga Alt Art SEC' },
  { code: 'OP13-120', variant: '_p2', desc: 'Sabo Manga Alt Art SEC' },

  // ── 2nd Anniversary GOLD MANGA RARES (OP-09) ────────────────────────────
  { code: 'OP09-118', variant: '_p2', desc: 'Gol D. Roger Gold Manga Rare SEC (OP-09 2nd Anniversary)' },
  { code: 'OP09-119', variant: '_p2', desc: 'Monkey D. Luffy Gold Emperor Manga Rare SEC (OP-09)' },
  { code: 'OP09-051', variant: '_p2', desc: 'Buggy Gold Manga Rare (OP-09 2nd Anniversary)' },
  { code: 'OP09-093', variant: '_p2', desc: 'Marshall D. Teach Gold Manga Rare (OP-09 2nd Anniversary)' },
  { code: 'OP09-004', variant: '_p2', desc: 'Shanks SP Gold Wanted Poster (OP-09 2nd Anniversary)' },

  // ── 3rd Anniversary SP Gold / Silver ────────────────────────────────────
  { code: 'OP05-119', variant: '_p7', desc: 'Monkey D. Luffy Gear 5 SP Gold 3rd Anniversary (OP-11 pull)' },
  { code: 'OP05-119', variant: '_p8', desc: 'Monkey D. Luffy Gear 5 SP Silver 3rd Anniversary' },
  { code: 'OP09-004', variant: '_p5', desc: 'Shanks SP Gold 3rd Anniversary (OP-13 pull)' },
  { code: 'OP09-004', variant: '_p6', desc: 'Shanks SP Silver 3rd Anniversary (OP-13 pull)' },
  { code: 'OP09-051', variant: '_p4', desc: 'Buggy SP Gold 3rd Anniversary (OP-14 pull)' },
  { code: 'OP09-093', variant: '_p4', desc: 'Blackbeard SP Gold 3rd Anniversary' },
  { code: 'OP09-093', variant: '_p5', desc: 'Blackbeard SP Silver 3rd Anniversary' },

  // ── Standard Manga Rares (one per main set) ─────────────────────────────
  { code: 'OP01-120', variant: '_p2', desc: 'Shanks Manga Alt Art SEC (OP-01 first-ever manga rare)' },
  { code: 'OP02-013', variant: '_p2', desc: 'Marco Manga Alt Art SEC (OP-02)' },
  { code: 'OP03-122', variant: '_p2', desc: 'Sogeking Manga Alt Art SEC (OP-03)' },
  { code: 'OP04-083', variant: '_p2', desc: 'Sabo Manga Alt Art SEC (OP-04)' },
  { code: 'OP05-069', variant: '_p2', desc: 'Trafalgar Law Manga Alt Art SEC (OP-05)' },
  { code: 'OP05-119', variant: '_p2', desc: 'Monkey D. Luffy Gear 5 Manga Alt Art SEC' },
  { code: 'OP06-118', variant: '_p2', desc: 'Roronoa Zoro Manga Alt Art SEC (OP-06)' },
  { code: 'OP07-051', variant: '_p2', desc: 'Boa Hancock Manga Alt Art SEC (OP-07)' },
  { code: 'OP08-118', variant: '_p2', desc: 'Silvers Rayleigh Manga Alt Art SEC (OP-08)' },
  { code: 'OP10-119', variant: '_p2', desc: 'Trafalgar Law Manga Alt Art SEC (OP-10)' },
  { code: 'OP11-118', variant: '_p2', desc: 'Monkey D. Luffy Snakeman Manga Alt Art SEC (OP-11)' },
  { code: 'OP12-118', variant: '_p2', desc: 'Jewelry Bonney Manga Alt Art SEC (OP-12)' },
  { code: 'OP14-119', variant: '_p2', desc: 'Dracule Mihawk Manga Alt Art SEC (OP-14)' },

  // ── Standard Parallel Foils (entry-level chase, often graded) ──────────
  { code: 'OP01-003', variant: '_p1', desc: 'Monkey D. Luffy Leader Parallel Foil (OP-01)' },
  { code: 'OP01-016', variant: '_p1', desc: 'Nami SR Parallel Foil (OP-01)' },
  { code: 'OP01-001', variant: '_p1', desc: 'Roronoa Zoro Leader Parallel Foil (OP-01)' },
  { code: 'OP01-002', variant: '_p1', desc: 'Trafalgar Law Leader Parallel Foil (OP-01)' },
  { code: 'OP01-060', variant: '_p1', desc: 'Donquixote Doflamingo Parallel Foil (OP-01)' },
  { code: 'OP01-078', variant: '_p1', desc: 'Boa Hancock SR Parallel Foil (OP-01)' },

  // ── EB-set chases ───────────────────────────────────────────────────────
  { code: 'EB01-006', variant: '_p2', desc: 'Tony Tony Chopper Memorial Manga Alt Art SEC (EB-01)' },
  { code: 'EB02-061', variant: '_p5', desc: 'Monkey D. Luffy SP Gold Leader Anime 25th (EB-02)' },
  { code: 'EB02-061', variant: '_p2', desc: 'Monkey D. Luffy Anime 25th Manga Alt Art SEC (EB-02)' },
  { code: 'EB03-053', variant: '_p2', desc: 'Nami Heroines SEC Manga Alt Art (EB-03)' },
  { code: 'EB03-061', variant: '_p2', desc: 'Uta Heroines SEC Manga Alt Art (EB-03)' },
  { code: 'EB04-061', variant: '_p2', desc: 'Nami Heroines New World SEC Manga Alt Art (EB-04)' },
  { code: 'EB04-001', variant: '_p1', desc: 'Boa Hancock SP Gold Leader Heroines New World (EB-04)' },

  // ── Tournament/CS prize cards (often single high-grade copies) ─────────
  { code: 'ST01-013', variant: '_p4', desc: 'Roronoa Zoro Treasure Cup 2023 Wave 1 Top 8 (ST01-013 stamp)' },
  { code: 'ST04-003', variant: '_p2', desc: 'Kaido CS 2023 Finals 2nd Place Trophy (JP frame)' },
  { code: 'OP04-112', variant: '_p2', desc: 'Rebecca CS 2023 Finals 1st Place Trophy (JP frame)' },
];

// Auto-expand from PRICE_DB at function-startup time. We pull every entry
// that has a top-level `en` field (chase data) and turn it into a slab
// target. PRICE_DB lives in public/data/prices.js — for the function we
// embed the names directly (kept short for the prompt). The dynamic build
// happens inside the handler so it can read process-time data.
let SLAB_TARGETS = CURATED_TARGETS;

function buildPrompt(targets) {
  const lines = targets.map((t, i) =>
    `${String(i + 1).padStart(3)}. ${t.code}${t.variant} — ${t.desc}`
  ).join('\n');

  return `You are a One Piece TCG English-market price expert specializing in graded card values.

For each card below, find current market prices for these grades:
  • PSA 10 (Gem Mint — most cards should have at least one comp)
  • BGS 10 Pristine (Beckett 10 — less common)
  • BGS 10 Black Label (perfect 10/10/10/10 subgrades — very rare)

SOURCES (search ALL of these per card; don't stop at the first one):
  1. eBay SOLD listings (filter LH_Sold=1 LH_Complete=1) — primary signal
  2. alt.xyz — graded card marketplace, has comprehensive PSA data
  3. fanaticscollect.com — auction results (formerly PWCC)
  4. TCGplayer graded singles
  5. PriceCharting graded charts
  6. Goldin Auctions — high-end records
  7. PSA pop report's "recent sales" tab

PRICING RULES:
  • Prefer MEDIAN of recent SOLD prices over optimistic active listings.
  • For thin markets, a SINGLE confirmed sold comp is acceptable — return
    the price with count: 1 and source explaining "single comp on
    {marketplace} {date}". This is MUCH more useful than null.
  • If you find a price RANGE across sources (e.g. eBay $1,800 vs alt.xyz
    $2,400), report the MIDPOINT and note the spread in source.
  • Only return null when you genuinely find ZERO confirmed sales anywhere.
    For null entries, source should briefly explain (e.g. "checked eBay
    sold 60d, alt.xyz, fanatics — no PSA 10 comps").
  • BGS Black Label genuinely is rare on most cards — null is fine there
    when truly absent.
  • Distinguish variants carefully. Code + suffix matters: OP05-119_p2 (Manga
    Alt) is a different physical card than OP05-119_p7 (3rd Anniv SP Gold).
  • For tournament/promo cards, JP-frame versions are often what's actually
    graded — check both EN and JP listings for the same code+suffix.

Cards to research (${targets.length} total):
${lines}

Return ONLY valid JSON. No markdown fences, no commentary, no preamble.
Output an entry for EVERY card listed (even if all three grades are null):
{
  "fetched_at": "${new Date().toISOString()}",
  "slabs": [
    {
      "code": "OP13-118",
      "variant": "_p3",
      "psa10":  {"price": "$24,000", "count": 8, "source": "eBay sold 30d median; range $22k-$26k"},
      "bgs10":  {"price": "$32,000", "count": 3, "source": "eBay + alt.xyz"},
      "bgsbl":  {"price": null,      "count": 0, "source": "checked eBay/alt/fanatics — no Black Label sales"}
    }
  ]
}`;
}

// Pull additional dynamic targets from the live /api/prices feed: every
// chase variant currently priced ≥ $100 raw becomes a slab candidate.
// This grows automatically as the market discovers new chases.
async function buildDynamicTargets(siteUrl) {
  const out = [];
  try {
    const r = await fetch(siteUrl + '/api/prices', { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return out;
    const data = await r.json();
    for (const [fullCode, entry] of Object.entries(data)) {
      if (fullCode.startsWith('_') || !entry || !entry.en) continue;
      const m = fullCode.match(/^([A-Z0-9]+-\d+)(_p\d+|_r\d+)?$/);
      if (!m) continue;
      const baseCode = m[1];
      const suffix   = m[2] || '';
      // Only chase-tier candidates worth the slab research cost.
      const dollars = parseFloat(String(entry.en).replace(/[$,]/g, ''));
      if (!Number.isFinite(dollars) || dollars < 100) continue;
      out.push({
        code:    baseCode,
        variant: suffix,
        desc:    (entry.name || baseCode) + ' ' + (suffix ? 'variant ' + suffix : 'base'),
        _price:  dollars,
      });
    }
  } catch (e) {
    console.error('[refresh-slabs] dynamic-target build failed:', e.message);
  }
  out.sort((a, b) => b._price - a._price);
  return out;
}

// Merge curated + dynamic, dedupe by code+variant, cap to maxN
function mergeTargets(curated, dynamic, maxN) {
  const seen = new Set();
  const out = [];
  for (const t of curated) {
    const k = t.code + t.variant;
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  for (const t of dynamic) {
    const k = t.code + t.variant;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= maxN) break;
  }
  return out;
}

export default async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[refresh-slabs] Missing ANTHROPIC_API_KEY env var');
    return new Response(
      JSON.stringify({ status: 'error', message: 'Missing ANTHROPIC_API_KEY' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const client  = new Anthropic({ apiKey });
  const started = new Date().toISOString();
  const t0 = Date.now();

  // Build the target list dynamically. Curated chase variants always
  // included; we then add the most expensive raw-priced cards from the
  // live feed (anything ≥ $100) up to a soft cap so we don't blow Claude's
  // context window or the per-run cost budget.
  const siteUrl = process.env.URL || 'https://grailcardz.com';
  const dynamic = await buildDynamicTargets(siteUrl);
  SLAB_TARGETS  = mergeTargets(CURATED_TARGETS, dynamic, /* maxN */ 150);

  console.log(`[refresh-slabs] starting at ${started}, ${SLAB_TARGETS.length} targets ` +
              `(${CURATED_TARGETS.length} curated + ${SLAB_TARGETS.length - CURATED_TARGETS.length} dynamic)`);

  let response;
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 16000,                          // bigger response — more cards
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{ role: 'user', content: buildPrompt(SLAB_TARGETS) }],
    });
  } catch (err) {
    console.error(`[refresh-slabs] Anthropic call failed: ${err.message}`);
    return new Response(
      JSON.stringify({ status: 'error', stage: 'anthropic', message: err.message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[refresh-slabs] usage: ${JSON.stringify(response.usage)}`);

  const text  = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) {
    console.error('[refresh-slabs] No JSON in response. First 500 chars:', text.slice(0, 500));
    return new Response(
      JSON.stringify({ status: 'error', stage: 'parse', message: 'No JSON in response' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let data;
  try {
    data = JSON.parse(clean.slice(s, e + 1));
  } catch (err) {
    console.error(`[refresh-slabs] JSON parse failed: ${err.message}`);
    return new Response(
      JSON.stringify({ status: 'error', stage: 'parse', message: err.message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Pivot into byCard structure keyed by code+variant.
  const byCard = {};
  let nonNullPrices = 0;
  for (const slab of (data.slabs || [])) {
    if (!slab.code) continue;
    const key = slab.variant ? `${slab.code}${slab.variant}` : slab.code;
    byCard[key] = {
      psa10: slab.psa10 || null,
      bgs10: slab.bgs10 || null,
      bgsbl: slab.bgsbl || null,
    };
    for (const grade of ['psa10', 'bgs10', 'bgsbl']) {
      if (byCard[key][grade] && byCard[key][grade].price) nonNullPrices++;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const payload = {
    _updated:    started,
    _cardCount:  Object.keys(byCard).length,
    _hits:       nonNullPrices,
    _source:     'claude_web_search',
    _model:      'claude-sonnet-4-6',
    _elapsedSec: parseFloat(elapsed),
    _usage:      response.usage,
    ...byCard,
  };

  const store = getStore('card-slab-prices');
  await store.setJSON('slabs', payload);

  console.log(`[refresh-slabs] done: ${Object.keys(byCard).length} cards, ${nonNullPrices} prices in ${elapsed}s`);

  return new Response(
    JSON.stringify({
      status:    'ok',
      updated:   started,
      cards:     Object.keys(byCard).length,
      hits:      nonNullPrices,
      elapsed:   `${elapsed}s`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

// Weekly Sundays 9 AM UTC. Was daily — at the expanded 150-card target list
// each run costs ~$5–15 (Claude Sonnet 4.6 + web_search), so weekly keeps
// the annual spend ~$250–800 instead of ~$1.8k–5.4k. Slab prices move slowly
// enough that weekly resolution is fine. Trigger manually any time via
// `curl -X POST https://grailcardz.com/.netlify/functions/refresh-slabs-background`.
export const config = { schedule: '0 9 * * 0' };
