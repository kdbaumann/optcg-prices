// netlify/functions/update-prices.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Scheduled function — runs daily at 6 AM UTC.
// Fetches the top-card market price for every tracked set from OPCardlist,
// writes the result to Netlify Blobs so the site-reader function can serve it.
//
// The schedule is defined at the bottom of this file via `export const config`.
// No dashboard toggle needed — Netlify picks it up automatically on deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { getStore } from '@netlify/blobs';

// ── Sets to fetch ─────────────────────────────────────────────────────────────
const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13','op-14','op-15',
  'eb-01','eb-02','eb-03','eb-04','prb-01','prb-02'
];

// OPCardlist URL pattern — each set page lists top cards with prices
const OPCARDLIST_BASE = 'https://opcardlist.com';

// ── Fetch one set's top-card data from OPCardlist ─────────────────────────────
async function fetchSetPrices(setCode) {
  const url = `${OPCARDLIST_BASE}/${setCode}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FulcrumPriceBot/1.0; +https://fulcrumcards.com)',
      'Accept': 'text/html',
    },
    // 15-second timeout per set
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${setCode}`);
  const html = await res.text();

  // OPCardlist renders card rows with data attributes like:
  //   data-card-id="OP13-118" and market prices in spans/divs
  // We extract the top 3 cards and their prices for robustness.
  const results = [];

  // Match card code + price pairs — OPCardlist uses consistent markup
  // Pattern: card code in a link/span, price immediately following as $X,XXX
  const cardBlocks = html.matchAll(
    /data-card-id="([A-Z0-9]+-\d+[^"]*)"[^>]*>[\s\S]{0,800}?\$(\d[\d,]+)/g
  );

  for (const match of cardBlocks) {
    const code  = match[1].trim();
    const price = parseInt(match[2].replace(/,/g, ''), 10);
    if (code && price > 0) {
      results.push({ code, price });
    }
    if (results.length >= 5) break;  // top 5 per set is enough
  }

  // Fallback: simpler price extraction if structured attrs aren't present
  if (results.length === 0) {
    const priceMatches = [...html.matchAll(/\$(\d[\d,]+)/g)];
    const codeMatches  = [...html.matchAll(/([A-Z]{2}\d{2}-\d{3})/g)];
    if (codeMatches[0] && priceMatches[0]) {
      results.push({
        code:  codeMatches[0][1],
        price: parseInt(priceMatches[0][1].replace(/,/g, ''), 10),
      });
    }
  }

  return results;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async () => {
  const started = new Date().toISOString();
  console.log(`[update-prices] Starting run at ${started}`);

  // Open the site-wide blob store (auto-configured by Netlify in production)
  const store = getStore('card-prices');

  const allPrices = {};
  const errors    = [];
  const setResults = {};

  // Fetch each set with a small delay to be polite to OPCardlist
  for (const setCode of SETS) {
    try {
      const cards = await fetchSetPrices(setCode);
      setResults[setCode] = cards.length;

      for (const { code, price } of cards) {
        // Only write if we don't already have a price, or the new one is higher
        // (OPCardlist lists highest-value cards first, so first hit wins)
        if (!allPrices[code]) {
          allPrices[code] = {
            en:      `$${price.toLocaleString('en-US')}`,
            updated: started,
          };
        }
      }

      console.log(`[update-prices] ${setCode}: ${cards.length} cards fetched`);
    } catch (err) {
      console.error(`[update-prices] ERROR ${setCode}: ${err.message}`);
      errors.push({ set: setCode, error: err.message });
    }

    // 200ms pause between requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Build the final payload
  const payload = {
    _updated:  started,
    _setCount: SETS.length,
    _cardCount: Object.keys(allPrices).length,
    _errors:   errors,
    ...allPrices,
  };

  // Write to Netlify Blobs — key "prices" in the "card-prices" store
  await store.setJSON('prices', payload, {
    metadata: {
      updatedAt:  started,
      cardCount:  String(Object.keys(allPrices).length),
      errorCount: String(errors.length),
    },
  });

  console.log(
    `[update-prices] Done. ${Object.keys(allPrices).length} card prices written. ` +
    `${errors.length} set errors.`
  );

  return new Response(JSON.stringify({
    status:    'ok',
    updated:   started,
    cardCount: Object.keys(allPrices).length,
    errors,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Runs every day at 6:00 AM UTC
export const config = { schedule: '0 6 * * *' };
