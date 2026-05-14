// netlify/functions/source-missing-art-background.mjs
//
// Background function (15-min budget). Two phases:
//
//   1. AUDIT — pull every variant code we reference (from /api/prices) and
//      probe Limitless EN, Bandai EN, Limitless JP. Codes that 404 on all
//      three are candidates for manual sourcing.
//
//   2. SOURCE — for each missing code, query eBay Browse API for listings
//      whose title includes the code, pull the first listing's primary
//      image, validate it's a real card-shaped image, and store it in
//      the `card-images-manual` Blob store. /card-img/ checks that store
//      first (see card-img.mjs).
//
// Triggered manually:
//   curl -X POST https://grailcardz.com/.netlify/functions/source-missing-art-background
//
// Scheduled monthly to pick up new tournament cards as they release. Kept
// monthly because each run is heavy (~200 eBay calls + ~200 image fetches)
// and the underlying data doesn't churn fast.
//
// Env vars required:
//   EBAY_APP_ID            — Production App ID
//   EBAY_OAUTH_TOKEN       — App-credentials OAuth token
//                            (https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html)
//
// Output: writes summary to `card-images-meta/source-run-{date}` Blob and
// returns it as JSON.

import { getStore } from '@netlify/blobs';

const LIM    = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
const BANDAI = 'https://en.onepiece-cardgame.com/images/cardlist/card';
const UA     = 'Mozilla/5.0 (compatible; FulcrumImageBot/1.0)';

// Per-card timeouts to keep the whole run inside the 15-min budget.
const PROBE_TIMEOUT_MS  = 6_000;
const FETCH_TIMEOUT_MS  = 10_000;
const MAX_CODES_PER_RUN = 250;     // hard cap so we don't blow the budget

// HEAD probe for "is there a real image at this URL"
async function probe(url) {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal:  AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return r.status === 200;
  } catch { return false; }
}

function probeChain(code) {
  const m = code.match(/^([A-Z]+\d+)/);
  const folder = m ? m[1] : (code.startsWith('P-') ? 'P' : 'OP01');
  return code.startsWith('P-')
    ? [`${LIM}/P/${code}_EN.webp`, `${BANDAI}/${code}.png`, `${LIM}/P/${code}_JP.webp`]
    : [`${LIM}/${folder}/${code}_EN.webp`, `${BANDAI}/${code}.png`, `${LIM}/${folder}/${code}_JP.webp`];
}

// Validate an arrayBuffer is a real image by sniffing magic bytes
function isRealImage(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 2048) return false;          // too small to be a card scan
  const isPNG  = b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47;
  const isJPEG = b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF;
  const isWebP = b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46
              && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50;
  return isPNG || isJPEG || isWebP;
}

// ── eBay Browse API search for one card code ──────────────────────────────
async function ebaySearchImage(code, oauthToken) {
  // eBay Browse API: search item summaries, ordered by relevance, US site.
  // Filter to "Cards" category (183454) to drop unrelated listings.
  // The query bakes in "one piece" + the card code. eBay returns listings
  // whose title matches; their `image.imageUrl` is the primary photo.
  const q = encodeURIComponent(`one piece tcg ${code}`);
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
              `q=${q}&category_ids=183454&limit=10`;
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'Authorization':              `Bearer ${oauthToken}`,
        'X-EBAY-C-MARKETPLACE-ID':    'EBAY_US',
        'Content-Type':                'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    return { error: 'fetch_fail', message: e.message };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { error: 'http_' + resp.status, message: body.slice(0, 200) };
  }
  const data = await resp.json().catch(() => null);
  if (!data || !data.itemSummaries) return { error: 'no_results' };

  // Score candidates by:
  //   • title contains the exact code (case-insensitive)
  //   • title doesn't contain words that suggest the wrong variant
  //   • image is the listing's primary image, not an icon
  const codeLower = code.toLowerCase();
  const baseCode  = code.replace(/(_p\d+|_r\d+)$/, '').toLowerCase();
  const variantSuffix = code.match(/(_p\d+|_r\d+)$/)?.[1]?.toLowerCase() || '';
  const candidates = [];
  for (const item of data.itemSummaries) {
    const title = (item.title || '').toLowerCase();
    const img   = item.image && item.image.imageUrl;
    if (!img) continue;
    // Must reference the exact code, OR the base code AND the variant fingerprint
    let score = 0;
    if (title.includes(codeLower))              score += 5;
    else if (title.includes(baseCode))          score += 2;
    else                                         continue;
    // Variant-specific keyword bonuses (rough mapping of suffix → words)
    const VARIANT_KEYS = {
      _p1: ['parallel', 'sr parallel', 'foil', 'winner'],
      _p2: ['manga', 'alt art', 'alternate'],
      _p3: ['red saa', 'red super', 'super alt', 'red super alt'],
      _p4: ['stamp', 'top 8', 'top 16', 'top 64', 'tournament', 'treasure cup', 'tc'],
      _p5: ['anniversary', 'sp gold', 'sp silver', 'gold'],
      _p6: ['anniversary', 'silver'],
      _p7: ['anniversary', 'gold'],
      _p8: ['anniversary', 'silver'],
      _r1: ['reprint', 'prb', 'premium booster'],
      _r2: ['reprint', 'prb-02', 'prb02', 'premium booster'],
    };
    const wantWords = VARIANT_KEYS[variantSuffix] || [];
    for (const w of wantWords) if (title.includes(w)) score += 2;
    // Penalty for terms that suggest wrong product (sealed, lot, playmat, etc.)
    const PENALTY = ['sealed', 'lot of', 'playmat', 'sleeve', 'box', 'case'];
    for (const w of PENALTY) if (title.includes(w)) score -= 3;
    candidates.push({ score, title: item.title, imageUrl: img, itemId: item.itemId });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0 || candidates[0].score < 5) return { error: 'no_match' };
  return { ...candidates[0], totalCandidates: candidates.length };
}

// Fetch image bytes, validate, return ArrayBuffer or null
async function fetchAndValidate(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (!isRealImage(buf)) return null;
    return buf;
  } catch { return null; }
}

export default async (req) => {
  const started = new Date().toISOString();
  const t0      = Date.now();
  const url     = new URL(req.url);
  const dryRun  = url.searchParams.get('dry') === '1';
  const limit   = Math.min(MAX_CODES_PER_RUN,
                  parseInt(url.searchParams.get('limit') || String(MAX_CODES_PER_RUN), 10));

  const oauthToken = process.env.EBAY_OAUTH_TOKEN;
  if (!oauthToken) {
    return new Response(JSON.stringify({
      status: 'error', message: 'Missing EBAY_OAUTH_TOKEN env var',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const manualStore = getStore('card-images-manual');
  const metaStore   = getStore('card-images-meta');

  // ── Phase 1: AUDIT ──────────────────────────────────────────────────────
  // Pull every variant code from the live price feed. We only audit codes
  // with a variant suffix (_pN/_rN) — base codes almost always have CDN art.
  const siteUrl = process.env.URL || 'https://grailcardz.com';
  let liveData;
  try {
    liveData = await (await fetch(`${siteUrl}/api/prices`, { signal: AbortSignal.timeout(10_000) })).json();
  } catch (e) {
    return new Response(JSON.stringify({
      status: 'error', message: '/api/prices fetch failed: ' + e.message,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const variantCodes = Object.keys(liveData)
    .filter(c => !c.startsWith('_') && /(_p\d+|_r\d+)$/.test(c))
    .sort();
  console.log(`[source-art] auditing ${variantCodes.length} variant codes`);

  // Skip codes we already have a manual image for — list keys in the store.
  let alreadyHave = new Set();
  try {
    const list = await manualStore.list({});
    alreadyHave = new Set((list && list.blobs || []).map(b => b.key));
  } catch {}

  // Probe each code's three CDN URLs in parallel (with a small concurrency cap)
  const missing = [];
  let probed = 0, alreadyHaveCount = 0;
  const CONCURRENCY = 8;
  let i = 0;
  async function worker() {
    while (i < variantCodes.length) {
      const code = variantCodes[i++];
      if (alreadyHave.has(code)) { alreadyHaveCount++; continue; }
      const urls = probeChain(code);
      let exists = false;
      for (const u of urls) {
        if (await probe(u)) { exists = true; break; }
      }
      probed++;
      if (!exists) missing.push(code);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[source-art] audit done: ${probed} probed, ${missing.length} missing, ${alreadyHaveCount} already in manual store`);

  // ── Phase 2: SOURCE (eBay) ─────────────────────────────────────────────
  const toSource = missing.slice(0, limit);
  const results  = [];
  let stored = 0, ebayMisses = 0, validateFails = 0;

  if (!dryRun) {
    for (const code of toSource) {
      // Stop early if we're approaching the 15-min budget (leave 60s headroom).
      if (Date.now() - t0 > 14 * 60_000) {
        console.log('[source-art] approaching budget, stopping');
        break;
      }
      const ebay = await ebaySearchImage(code, oauthToken);
      if (ebay.error) {
        ebayMisses++;
        results.push({ code, status: 'no_ebay_match', detail: ebay.error });
        continue;
      }
      const buf = await fetchAndValidate(ebay.imageUrl);
      if (!buf) {
        validateFails++;
        results.push({ code, status: 'invalid_image', src: ebay.imageUrl });
        continue;
      }
      try {
        await manualStore.set(code, buf, {
          metadata: {
            source:    'ebay',
            ebayItem:  ebay.itemId,
            ebayTitle: ebay.title,
            srcUrl:    ebay.imageUrl,
            storedAt:  new Date().toISOString(),
          },
        });
        stored++;
        results.push({ code, status: 'stored', srcTitle: ebay.title.slice(0, 80) });
      } catch (e) {
        results.push({ code, status: 'blob_write_fail', error: e.message });
      }
    }
  }

  const summary = {
    _ranAt:    started,
    _elapsedSec: Math.round((Date.now() - t0) / 1000),
    _dryRun:   dryRun,
    audit: {
      variantCodes:  variantCodes.length,
      probed,
      missing:       missing.length,
      alreadyManual: alreadyHaveCount,
    },
    sourcing: { toSource: toSource.length, stored, ebayMisses, validateFails },
    sample:    results.slice(0, 30),
    missingCodes: missing.slice(0, 100),
  };

  // Save run summary for inspection
  await metaStore.setJSON(`source-run-${started.slice(0, 10)}`, summary);

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// Monthly Sundays 11 AM UTC — well after the daily price scrape (06:00) and
// the weekly slab refresh (Sun 09:00). Adjust freely; eBay token must be
// present in env vars.
export const config = { schedule: '0 11 1 * *' };
