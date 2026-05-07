// netlify/functions/update-slab-prices.mjs
// Scheduled daily 8 AM UTC — queries eBay Browse API for current asking
// prices on graded slabs of every chase card we care about, aggregates
// low / median / listing-count per (card, grade) pair, and stores the
// result in a separate Netlify Blob ("card-slab-prices/slabs") that the
// /api/slabs function reads.
//
// eBay Browse API gives ACTIVE listings only (asking prices). For SOLD
// transaction prices we'd need the Marketplace Insights API, which is
// gated and requires a separate eBay developer application.
//
// Auth: OAuth 2.0 Client Credentials grant. Reads EBAY_APP_ID and
// EBAY_CERT_ID from Netlify environment variables.

import { getStore } from '@netlify/blobs';

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
// 183454 = Trading Card Singles (eBay leaf category for OPTCG singles)
const EBAY_CATEGORY = '183454';

// Cards we track grading prices for. Match this list to chase entries in
// public/data/prices.js with structured PSA/BGS data.
const CARDS_TO_TRACK = [
  // Red SAA / 3rd Anniversary chases
  'OP13-118', 'OP13-119', 'OP13-120',
  // 2nd / 3rd Anniversary Gold Manga Rares
  'OP09-118', 'OP09-119', 'OP09-051', 'OP09-093', 'OP09-004',
  // Manga Rares — main set chases
  'OP01-120', 'OP05-119', 'OP06-118', 'OP07-051', 'OP08-118',
  'OP10-119', 'OP11-118', 'OP12-118', 'OP14-119',
  'OP03-122', 'OP04-083', 'OP01-003', 'OP01-016',
  // EB chases
  'EB01-006', 'EB02-061', 'EB03-053', 'EB03-061', 'EB04-061',
  // Tournament promos
  'OP02-099', 'OP02-096', 'ST01-013', 'ST01-001',
];

// Grade queries — eBay doesn't have a structured "grade" filter so we match
// on title text. The regex must show up *literally* in the listing title for
// us to count it; this filters out cross-category noise (e.g. "PSA 10
// Pikachu" returned because "One Piece" appears in the seller's bio).
const GRADES = [
  { key: 'psa10',  q: 'PSA 10',          re: /\bPSA\s*10\b/i },
  { key: 'bgs10',  q: 'BGS 10 Pristine', re: /\bBGS\s*10\b|\bBGS\s*Pristine\b/i },
  { key: 'bgsbl',  q: 'BGS Black Label', re: /\bBGS\s*Black\s*Label\b|\bBGS\s*BL\b|\bBGS\s*10\.0\b/i },
];

// ── OAuth token (Client Credentials grant) ────────────────────────────────────

async function getEbayToken() {
  const appId  = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error('Missing EBAY_APP_ID or EBAY_CERT_ID in env');
  }
  const basic = Buffer.from(`${appId}:${certId}`).toString('base64');
  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth response missing access_token');
  return data.access_token;
}

// ── Search a single (card, grade) combo and aggregate prices ─────────────────

async function searchOneCombo(token, code, grade) {
  const query = `one piece ${code} ${grade.q}`;
  const url = `${EBAY_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=20&category_ids=${EBAY_CATEGORY}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  const items = data.itemSummaries || [];

  // Listing must mention BOTH the card code AND the grade in the title to
  // be counted. eBay's text search is broad, so this filter cuts noise.
  const codeRe = new RegExp(code.replace('-', '[\\s-]?'), 'i');
  const matching = items.filter(item => {
    if (!item.title) return false;
    if (!codeRe.test(item.title)) return false;
    if (!grade.re.test(item.title)) return false;
    return true;
  });

  const prices = matching
    .map(item => parseFloat(item.price && item.price.value))
    .filter(p => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;
  return {
    low:    Math.round(prices[0]),
    median: Math.round(prices[Math.floor(prices.length / 2)]),
    high:   Math.round(prices[prices.length - 1]),
    count:  prices.length,
  };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtUsd(n) {
  if (!Number.isFinite(n)) return null;
  return '$' + Math.round(n).toLocaleString('en-US');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async () => {
  const started = new Date().toISOString();

  // Auth first — single token used for all queries.
  let token;
  try {
    token = await getEbayToken();
  } catch (err) {
    console.error('[update-slab-prices] auth failed:', err.message);
    return new Response(
      JSON.stringify({ status: 'error', stage: 'auth', message: err.message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build all (card, grade) tasks.
  const tasks = [];
  for (const code of CARDS_TO_TRACK) {
    for (const grade of GRADES) {
      tasks.push({ code, grade });
    }
  }

  const settled = await Promise.allSettled(
    tasks.map(({ code, grade }) =>
      searchOneCombo(token, code, grade).then(res => ({ code, grade: grade.key, res }))
    )
  );

  // Pivot into { code: { psa10:{...}, bgs10:{...}, bgsbl:{...} } }
  const byCard = {};
  let queries = 0, hits = 0, errors = [];
  for (const r of settled) {
    queries++;
    if (r.status === 'rejected') {
      errors.push(r.reason && r.reason.message ? r.reason.message : String(r.reason));
      continue;
    }
    const { code, grade, res } = r.value;
    if (!res) continue;
    hits++;
    if (!byCard[code]) byCard[code] = {};
    byCard[code][grade] = {
      low:    fmtUsd(res.low),
      median: fmtUsd(res.median),
      high:   fmtUsd(res.high),
      count:  res.count,
    };
  }

  const payload = {
    _updated:    started,
    _cardCount:  Object.keys(byCard).length,
    _queries:    queries,
    _hits:       hits,
    _errors:     errors.slice(0, 5),  // cap log noise
    ...byCard,
  };

  const store = getStore('card-slab-prices');
  await store.setJSON('slabs', payload);
  console.log(`[update-slab-prices] Done. ${queries} queries, ${hits} hits, ${Object.keys(byCard).length} cards covered.`);

  return new Response(
    JSON.stringify({
      status:    'ok',
      updated:   started,
      cards:     Object.keys(byCard).length,
      queries,
      hits,
      errorCount: errors.length,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

export const config = { schedule: '0 8 * * *' };
