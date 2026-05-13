// netlify/functions/card-img.mjs
// Serves card images from Netlify Blobs cache.
// Route: /card-img/:code  (e.g. /card-img/OP13-016_p4)
// First request fetches from CDN, validates it's a real image, then caches.

import { getStore } from '@netlify/blobs';

const LIM       = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
const BANDAI_EN = 'https://en.onepiece-cardgame.com/images/cardlist/card';
const BANDAI_JP = 'https://www.onepiece-cardgame.com/images/cardlist/card';

// Build the CDN URL list to try, in priority order. Strategy:
//   1) Try the EXACT variant on EN CDNs first (matches the EN print user
//      expects 95% of the time)
//   2) Then the EXACT variant on JP CDNs — many high-tier tournament cards
//      (CS finals, Worlds, Treasure Cup top placements, store-tournament
//      winners) were physically distributed as JP-frame cards even at EN
//      events. When the EN variant 404s, the JP variant is almost always
//      what the player actually owns.
//   3) Then fall back to the BASE code (no _pN/_rN) on EN, then JP. The
//      base art is never the right alt-art frame, but it's at least the
//      right CHARACTER — far better UX than a faded blank tile.
function srcUrls(code) {
  const setM    = code.match(/^([A-Z]+\d+)/);
  const folder  = setM ? setM[1] : (code.startsWith('P-') ? 'P' : 'OP01');
  const unusual = /_p[6-9]|_p1\d|_r\d/.test(code);
  const isPromo = code.startsWith('P-');

  // Parse base code (e.g. OP01-002_p4 → OP01-002) for the final fallback tier.
  const baseM      = code.match(/^(.+?)(_p\d+|_r\d+)$/);
  const baseCode   = baseM ? baseM[1] : null;
  const baseFolder = baseCode && baseCode.match(/^([A-Z]+\d+)/)
    ? baseCode.match(/^([A-Z]+\d+)/)[1]
    : (baseCode && baseCode.startsWith('P-') ? 'P' : null);

  // Variant-level fallback tier (EN before JP — most users want EN frames).
  const variantEN = isPromo
    ? [`${LIM}/P/${code}_EN.webp`, `${BANDAI_EN}/${code}.png`]
    : (unusual || code.endsWith('_p4'))
      ? [`${BANDAI_EN}/${code}.png`, `${LIM}/${folder}/${code}_EN.webp`]
      : [`${LIM}/${folder}/${code}_EN.webp`, `${BANDAI_EN}/${code}.png`];

  // JP variant: same code with _JP suffix on Limitless and the unprefixed
  // Bandai JP domain. Many tournament cards exist ONLY in JP-frame form.
  const variantJP = isPromo
    ? [`${LIM}/P/${code}_JP.webp`, `${BANDAI_JP}/${code}.png`]
    : [`${LIM}/${folder}/${code}_JP.webp`, `${BANDAI_JP}/${code}.png`];

  // Base-code fallback tier — best-effort "right character at least".
  const baseFallbacks = baseCode
    ? [
        `${LIM}/${baseFolder}/${baseCode}_EN.webp`,
        `${BANDAI_EN}/${baseCode}.png`,
        `${LIM}/${baseFolder}/${baseCode}_JP.webp`,
        `${BANDAI_JP}/${baseCode}.png`,
      ]
    : [];

  return [...variantEN, ...variantJP, ...baseFallbacks];
}

function isRealImage(buf, contentType) {
  const b = new Uint8Array(buf);
  if (b.length < 512) return false;
  if (contentType && contentType.includes('text/html')) return false;
  const isPNG  = b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47;
  const isJPEG = b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF;
  const isWebP = b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46
              && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50;
  const isGIF  = b[0]===0x47 && b[1]===0x49 && b[2]===0x46;
  // Reject tiny GIFs — Bandai returns a 1×1 GIF blocker
  if (isGIF && b.length < 2048) return false;
  return isPNG || isJPEG || isWebP || isGIF;
}

async function fetchValidImage(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FulcrumCards/1.0)',
          'Accept': 'image/webp,image/png,image/jpeg,image/*',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) continue;
      const ct  = r.headers.get('content-type') || '';
      const buf = await r.arrayBuffer();
      if (isRealImage(buf, ct)) return { buf, url, ct };
    } catch { /* try next */ }
  }
  return null;
}

export default async (req) => {
  const url  = new URL(req.url);
  const code = decodeURIComponent(
    url.pathname.replace('/card-img/', '').replace(/\.(png|webp)$/, '')
  );

  if (!code.match(/^[A-Z0-9]+-\d{3}/)) {
    return new Response('Invalid code', { status: 400 });
  }

  const store = getStore('card-images');

  // 1. Serve from Blob cache (already validated at store time)
  try {
    const cached = await store.get(code, { type: 'arrayBuffer' });
    if (cached && cached.byteLength > 512) {
      return new Response(cached, {
        headers: {
          'Content-Type':  'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Source':      'blob',
        },
      });
    }
  } catch { /* not cached */ }

  // 2. Fetch from CDN, validate, cache, return
  const hit = await fetchValidImage(srcUrls(code));

  if (!hit) {
    return new Response('Card image not found or could not be validated', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Cache async — don't block the response
  store.set(code, hit.buf, {
    metadata: { src: hit.url, at: new Date().toISOString() },
  }).catch(e => console.error('[card-img] cache error:', e.message));

  return new Response(hit.buf, {
    headers: {
      'Content-Type':  hit.ct || 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Source':      'cdn-fresh',
    },
  });
};

export const config = { path: '/card-img/:code' };
