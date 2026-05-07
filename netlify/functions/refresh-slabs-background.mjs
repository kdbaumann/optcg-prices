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
const SLAB_TARGETS = [
  // ── 3rd Anniversary RED SAA (OP-13) ─────────────────────────────────────
  { code: 'OP13-118', variant: '_p3', desc: 'Monkey D. Luffy Red Super Alt Art SEC (3rd Anniversary)' },
  { code: 'OP13-119', variant: '_p3', desc: 'Portgas D. Ace Red Super Alt Art SEC (3rd Anniversary)' },
  { code: 'OP13-120', variant: '_p3', desc: 'Sabo Red Super Alt Art SEC (3rd Anniversary)' },

  // ── OP-13 Manga Alt Art ─────────────────────────────────────────────────
  { code: 'OP13-118', variant: '_p2', desc: 'Monkey D. Luffy Manga Alt Art SEC' },

  // ── 2nd Anniversary GOLD MANGA RARES (OP-09) ────────────────────────────
  { code: 'OP09-118', variant: '_p2', desc: 'Gol D. Roger Gold Manga Rare SEC (OP-09 2nd Anniversary)' },
  { code: 'OP09-119', variant: '_p2', desc: 'Monkey D. Luffy Gold Emperor Manga Rare SEC (OP-09)' },
  { code: 'OP09-051', variant: '_p2', desc: 'Buggy Gold Manga Rare (OP-09 2nd Anniversary)' },
  { code: 'OP09-093', variant: '_p2', desc: 'Marshall D. Teach Gold Manga Rare (OP-09 2nd Anniversary)' },
  { code: 'OP09-004', variant: '_p2', desc: 'Shanks SP Gold Wanted Poster (OP-09 2nd Anniversary)' },

  // ── 3rd Anniversary SP Gold / Silver ────────────────────────────────────
  { code: 'OP05-119', variant: '_p7', desc: 'Monkey D. Luffy Gear 5 SP Gold 3rd Anniversary (OP-11 pull)' },
  { code: 'OP05-119', variant: '_p8', desc: 'Monkey D. Luffy Gear 5 SP Silver 3rd Anniversary' },
  { code: 'OP09-051', variant: '_p4', desc: 'Buggy SP Gold 3rd Anniversary (OP-14 pull)' },

  // ── Standard Manga Rares (one per main set) ─────────────────────────────
  { code: 'OP01-120', variant: '_p2', desc: 'Shanks Manga Alt Art SEC (OP-01 first-ever manga rare)' },
  { code: 'OP05-119', variant: '_p2', desc: 'Monkey D. Luffy Gear 5 Manga Alt Art SEC' },
  { code: 'OP06-118', variant: '_p2', desc: 'Roronoa Zoro Manga Alt Art SEC (OP-06)' },
  { code: 'OP07-051', variant: '_p2', desc: 'Boa Hancock Manga Alt Art SEC (OP-07)' },
  { code: 'OP08-118', variant: '_p2', desc: 'Silvers Rayleigh Manga Alt Art SEC (OP-08)' },
  { code: 'OP10-119', variant: '_p2', desc: 'Trafalgar Law Manga Alt Art SEC (OP-10)' },
  { code: 'OP11-118', variant: '_p2', desc: 'Monkey D. Luffy Snakeman Manga Alt Art SEC (OP-11)' },
  { code: 'OP12-118', variant: '_p2', desc: 'Jewelry Bonney Manga Alt Art SEC (OP-12)' },
  { code: 'OP14-119', variant: '_p2', desc: 'Dracule Mihawk Manga Alt Art SEC (OP-14)' },
  { code: 'OP03-122', variant: '_p2', desc: 'Sogeking Manga Alt Art SEC (OP-03)' },
  { code: 'OP04-083', variant: '_p2', desc: 'Sabo Manga Alt Art SEC (OP-04)' },

  // ── OP-01 Leader Parallels (most graded entry-level cards) ─────────────
  { code: 'OP01-003', variant: '_p1', desc: 'Monkey D. Luffy Leader Parallel Foil (OP-01)' },
  { code: 'OP01-016', variant: '_p1', desc: 'Nami SR Parallel Foil (OP-01)' },

  // ── EB-set chases ───────────────────────────────────────────────────────
  { code: 'EB01-006', variant: '_p2', desc: 'Tony Tony Chopper Memorial Manga Alt Art SEC (EB-01)' },
  { code: 'EB02-061', variant: '_p5', desc: 'Monkey D. Luffy SP Gold Leader Anime 25th (EB-02)' },
  { code: 'EB03-053', variant: '_p2', desc: 'Nami Heroines SEC Manga Alt Art (EB-03)' },
  { code: 'EB03-061', variant: '_p2', desc: 'Uta Heroines SEC Manga Alt Art (EB-03)' },
  { code: 'EB04-061', variant: '_p2', desc: 'Nami Heroines New World SEC Manga Alt Art (EB-04)' },
];

function buildPrompt(targets) {
  const lines = targets.map((t, i) =>
    `${String(i + 1).padStart(2)}. ${t.code}${t.variant} — ${t.desc}`
  ).join('\n');

  return `You are a One Piece TCG English-market price expert specializing in graded card values.

For each card below, find current market prices for these grades:
  • PSA 10 (Gem Mint, the most common premium grade — should usually have data)
  • BGS 10 Pristine (black-label-equivalent, less common)
  • BGS 10 Black Label (perfect 10/10/10/10 subgrades — very rare, often null)

SOURCES (in priority order):
  1. eBay completed/sold listings, last 60 days — most reliable signal
  2. TCGplayer graded singles
  3. PriceCharting graded data
  4. alt.xyz, fanaticscollect.com
  5. PSA pop reports with recent sales

RULES:
  • Use MEDIAN of recent SOLD prices. Ignore optimistic active asks and outliers.
  • For thin-market cards where private sales dominate (Roger Gold Manga BGS 10,
    Red SAA BGS Black Label, etc.), set price: null with source: "private_market".
  • BGS Black Label is rare — most cards will be null for that grade.
  • Distinguish variants carefully. Code + suffix matters — OP05-119_p2 (Manga Alt)
    is a different physical card than OP05-119_p7 (3rd Anniv SP Gold).
  • If you can't find ≥2 recent sales for a (card, grade) combo, return null with
    a brief explanation in source. Don't guess.

Cards to research:
${lines}

Return ONLY valid JSON. No markdown fences, no commentary, no preamble:
{
  "fetched_at": "${new Date().toISOString()}",
  "slabs": [
    {
      "code": "OP13-118",
      "variant": "_p3",
      "psa10":  {"price": "$24,000", "count": 8, "source": "eBay sold last 30d"},
      "bgs10":  {"price": "$32,000", "count": 3, "source": "eBay + alt.xyz"},
      "bgsbl":  {"price": null,      "count": 0, "source": "no recent sales"}
    }
  ]
}`;
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
  console.log(`[refresh-slabs] starting at ${started}, ${SLAB_TARGETS.length} targets`);

  let response;
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8000,
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

// Daily 9 AM UTC, offset 1 hour after update-prices (8 AM) to spread load.
export const config = { schedule: '0 9 * * *' };
