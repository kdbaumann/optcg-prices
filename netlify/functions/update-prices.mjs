// netlify/functions/update-prices.mjs
// Scheduled daily 6 AM UTC — fetches top card prices from OPCardlist → Netlify Blobs

import { getStore } from '@netlify/blobs';

const SETS = [
  'op-01','op-02','op-03','op-04','op-05','op-06','op-07','op-08',
  'op-09','op-10','op-11','op-12','op-13',
  'eb-01','eb-02','eb-03','prb-01',
];
const SETS_EXPERIMENTAL = ['op-14','op-15','eb-04','prb-02'];
const OPCARDLIST_BASE = 'https://opcardlist.com';

async function fetchSetPrices(setCode, silent404 = false) {
  const url = `${OPCARDLIST_BASE}/${setCode}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FulcrumPriceBot/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) {
    if (!silent404) console.log(`[update-prices] ${setCode}: not yet indexed (404)`);
    return [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const results = [];
  for (const m of html.matchAll(/data-card-id="([A-Z0-9]+-\d+)"[\s\S]{0,600}?\$(\d[\d,]+)/g)) {
    const price = parseInt(m[2].replace(/,/g, ''), 10);
    if (m[1] && price >= 10) results.push({ code: m[1].trim(), price });
    if (results.length >= 10) break;
  }
  return results;
}

export default async () => {
  const started = new Date().toISOString();
  const store   = getStore('card-prices');
  const allPrices = {};
  const errors = [];

  for (const setCode of SETS) {
    try {
      const cards = await fetchSetPrices(setCode);
      for (const { code, price } of cards) {
        if (!allPrices[code]) allPrices[code] = { en: `$${price.toLocaleString('en-US')}`, updated: started };
      }
      console.log(`[update-prices] ${setCode}: ${cards.length} cards`);
    } catch (err) {
      errors.push({ set: setCode, error: err.message });
      console.error(`[update-prices] ERROR ${setCode}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  for (const setCode of SETS_EXPERIMENTAL) {
    try {
      const cards = await fetchSetPrices(setCode, true);
      if (cards.length > 0) {
        for (const { code, price } of cards) {
          if (!allPrices[code]) allPrices[code] = { en: `$${price.toLocaleString('en-US')}`, updated: started };
        }
        console.log(`[update-prices] ${setCode}: ${cards.length} cards (newly indexed!)`);
      }
    } catch { /* silent */ }
    await new Promise(r => setTimeout(r, 200));
  }

  const payload = { _updated: started, _cardCount: Object.keys(allPrices).length, _errors: errors, ...allPrices };
  await store.setJSON('prices', payload);
  console.log(`[update-prices] Done. ${Object.keys(allPrices).length} prices stored.`);

  return new Response(JSON.stringify({ status: 'ok', updated: started, cardCount: Object.keys(allPrices).length, errors }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { schedule: '0 6 * * *' };
