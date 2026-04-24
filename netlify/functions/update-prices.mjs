// netlify/functions/update-prices.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Scheduled function — runs daily at 6 AM UTC.
// Fetches top card market prices from OPCardlist and stores in Netlify Blobs.
// ─────────────────────────────────────────────────────────────────────────────

import { getStore } from '@netlify/blobs';

// Sets confirmed to exist on OPCardlist (as of Apr 2026).
// Add op-14, op-15, eb-04, prb-02 once OPCardlist indexes them.
const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13',
  'eb-01','eb-02','eb-03',
  'prb-01',
];

// Newer sets — try these but expect 404 until OPCardlist indexes them
const SETS_EXPERIMENTAL = ['op-14','op-15','eb-04','prb-02'];

const OPCARDLIST_BASE = 'https://opcardlist.com';

async function fetchSetPrices(setCode, silent404 = false) {
  const url = `${OPCARDLIST_BASE}/${setCode}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FulcrumPriceBot/1.0)',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) {
    if (!silent404) console.log(`[update-prices] ${setCode}: not yet indexed on OPCardlist (404)`);
    return [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const results = [];

  // OPCardlist renders cards as rows with the card code visible in links/spans
  // and prices like $1,234 or $12,345 nearby.
  // Strategy: find all card code patterns and the nearest dollar amount after them.

  // Pattern 1: explicit data-card-id attributes
  for (const m of html.matchAll(/data-card-id="([A-Z0-9]+-\d+)"[\s\S]{0,600}?\$(\d[\d,]+)/g)) {
    const code  = m[1].trim();
    const price = parseInt(m[2].replace(/,/g, ''), 10);
    if (code && price >= 10) results.push({ code, price });
    if (results.length >= 10) break;
  }

  // Pattern 2: card codes appearing near prices in the HTML stream
  if (results.length === 0) {
    const chunks = html.split(/(?=[A-Z]{2}\d{2}-\d{3})/);
    for (const chunk of chunks.slice(1, 12)) {
      const codeM  = chunk.match(/^([A-Z]{2}\d{2}-\d{3})/);
      const priceM = chunk.match(/\$(\d[\d,]+)/);
      if (codeM && priceM) {
        const price = parseInt(priceM[1].replace(/,/g, ''), 10);
        if (price >= 10) results.push({ code: codeM[1], price });
      }
    }
  }

  return results;
}

export default async () => {
  const started = new Date().toISOString();
  console.log(`[update-prices] Starting run at ${started}`);

  const store = getStore('card-prices');
  const allPrices = {};
  const errors = [];

  // Fetch confirmed sets
  for (const setCode of SETS) {
    try {
      const cards = await fetchSetPrices(setCode);
      for (const { code, price } of cards) {
        if (!allPrices[code]) {
          allPrices[code] = { en: `$${price.toLocaleString('en-US')}`, updated: started };
        }
      }
      console.log(`[update-prices] ${setCode}: ${cards.length} card${cards.length !== 1 ? 's' : ''} fetched`);
    } catch (err) {
      console.error(`[update-prices] ERROR ${setCode}: ${err.message}`);
      errors.push({ set: setCode, error: err.message });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Try newer sets silently — no error logged if they 404
  for (const setCode of SETS_EXPERIMENTAL) {
    try {
      const cards = await fetchSetPrices(setCode, true);
      if (cards.length > 0) {
        for (const { code, price } of cards) {
          if (!allPrices[code]) {
            allPrices[code] = { en: `$${price.toLocaleString('en-US')}`, updated: started };
          }
        }
        console.log(`[update-prices] ${setCode}: ${cards.length} cards fetched (newly indexed!)`);
      }
    } catch (err) {
      // Silently ignore — these sets just aren't on OPCardlist yet
    }
    await new Promise(r => setTimeout(r, 200));
  }

  const cardCount = Object.keys(allPrices).length;

  const payload = {
    _updated:   started,
    _cardCount: cardCount,
    _errors:    errors,
    ...allPrices,
  };

  await store.setJSON('prices', payload, {
    metadata: { updatedAt: started, cardCount: String(cardCount) },
  });

  console.log(`[update-prices] Done. ${cardCount} prices stored. ${errors.length} errors.`);

  return new Response(JSON.stringify({
    status: 'ok', updated: started, cardCount, errors,
  }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '0 6 * * *' };
