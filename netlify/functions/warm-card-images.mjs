// netlify/functions/warm-card-images.mjs
// Pre-downloads all card images into Netlify Blobs.
// Validates that each response is actually a real image before storing.
// Runs weekly Sunday 3 AM UTC; safe to invoke manually anytime.

import { getStore } from '@netlify/blobs';

const LIM    = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
const BANDAI = 'https://en.onepiece-cardgame.com/images/cardlist/card';

const CARD_CODES = [
  // OP-01
  'OP01-001','OP01-001_p1','OP01-002','OP01-002_p4','OP01-003','OP01-003_p1',
  'OP01-016','OP01-016_p1','OP01-016_p8','OP01-024','OP01-024_p1',
  'OP01-025','OP01-025_p1','OP01-035','OP01-035_p2','OP01-051',
  'OP01-060','OP01-060_p1','OP01-061','OP01-073','OP01-073_p2',
  'OP01-078','OP01-078_p1','OP01-114','OP01-114_p1',
  'OP01-120','OP01-120_p1','OP01-120_p2',
  // OP-02
  'OP02-013','OP02-013_p2','OP02-013_p3','OP02-013_r1',
  'OP02-025','OP02-025_p1','OP02-096','OP02-096_p4',
  'OP02-097','OP02-097_p4','OP02-099','OP02-099_p4',
  // OP-03
  'OP03-003','OP03-003_p1','OP03-013','OP03-013_p4',
  'OP03-022','OP03-022_p1','OP03-077','OP03-099','OP03-099_p1','OP03-122','OP03-122_r1',
  // OP-04
  'OP04-039','OP04-039_p2','OP04-039_p3','OP04-083','OP04-083_p1','OP04-083_r1','OP04-106',
  // OP-05
  'OP05-001','OP05-018','OP05-060','OP05-069','OP05-069_r1','OP05-074','OP05-074_p3',
  'OP05-080','OP05-080_p1',
  'OP05-119','OP05-119_p1','OP05-119_p4','OP05-119_p7','OP05-119_p8','OP05-119_r1',
  // OP-06
  'OP06-047','OP06-093','OP06-101','OP06-101_p2',
  'OP06-118','OP06-118_p1','OP06-118_p3','OP06-118_r1','OP06-119','OP06-119_p1',
  // OP-07
  'OP07-001','OP07-001_p1','OP07-019','OP07-019_p1','OP07-038','OP07-038_p1',
  'OP07-051','OP07-051_p1','OP07-051_p2','OP07-051_p3',
  'OP07-109','OP07-109_p1','OP07-109_p2',
  // OP-08
  'OP08-118','OP08-118_p1',
  // OP-09
  'OP09-004','OP09-004_p2','OP09-004_p3','OP09-004_p5','OP09-004_p6',
  'OP09-051','OP09-051_p2','OP09-051_p4','OP09-051_p5',
  'OP09-065','OP09-065_p1','OP09-069','OP09-069_p1','OP09-076','OP09-076_p1',
  'OP09-093','OP09-093_p2','OP09-093_p3','OP09-093_p4',
  'OP09-118','OP09-118_p1','OP09-118_p2','OP09-119',
  // OP-10 to OP-14
  'OP10-119',
  'OP11-004','OP11-004_p4','OP11-004_p5','OP11-010','OP11-010_p1','OP11-010_p4','OP11-118','OP11-119',
  'OP12-015','OP12-015_p4','OP12-020','OP12-020_p1','OP12-030','OP12-031','OP12-031_p3','OP12-031_p4','OP12-031_p5','OP12-118',
  'OP13-016','OP13-016_p4','OP13-079','OP13-079_p2',
  'OP13-118','OP13-118_p2','OP13-118_p3',
  'OP13-119','OP13-119_p3','OP13-119_p4',
  'OP13-120','OP13-120_p2','OP13-120_p3',
  'OP14-001','OP14-001_p5','OP14-079','OP14-112','OP14-119',
  // EB sets
  'EB01-001','EB01-001_p1','EB01-006','EB01-006_p1','EB01-006_p2','EB01-006_r1',
  'EB01-012','EB01-012_p1','EB01-013_p1','EB01-040_p1','EB01-046_p1','EB01-048_p1','EB01-056_p2','EB01-061_p1',
  'EB02-010_p1','EB02-019','EB02-019_p1','EB02-061','EB02-061_p1','EB02-061_p2',
  'EB03-003_p2','EB03-018_p2','EB03-024','EB03-024_p2','EB03-026','EB03-026_p2',
  'EB03-053','EB03-053_p1','EB03-053_p2','EB03-055','EB03-055_p2','EB03-061','EB03-061_p2',
  'EB04-001','EB04-001_p1','EB04-044','EB04-044_p2',
  'EB04-059','EB04-059_p2','EB04-060','EB04-060_p2','EB04-061','EB04-061_p2','EB04-062','EB04-062_p2',
  // ST sets
  'ST01-001','ST01-001_p2','ST01-012','ST01-012_p3',
  'ST01-013','ST01-013_p1','ST01-013_p4',
  'ST03-013_p4','ST04-003','ST04-003_p2',
  'ST10-004','ST10-010','ST10-010_p2',
  // PRB
  'PRB01-001',
  // Promos
  'P-021','P-022','P-025','P-033','P-035','P-039','P-042','P-043',
  'P-047','P-049','P-053','P-065','P-066','P-067','P-068','P-070',
  'P-086','P-087','P-088','P-090','P-091','P-097','P-098',
];

function srcUrls(code) {
  const setM   = code.match(/^([A-Z]+\d+)/);
  const folder = setM ? setM[1] : (code.startsWith('P-') ? 'P' : 'OP01');
  const unusual = /_p[6-9]|_p1\d|_r\d/.test(code);
  const isPromo = code.startsWith('P-');

  if (isPromo) {
    return [
      `${LIM}/P/${code}_EN.webp`,
      `${LIM}/P/${code}_JP.webp`,
      `${BANDAI}/${code}.png`,
    ];
  }
  if (unusual || code.endsWith('_p4')) {
    return [`${BANDAI}/${code}.png`, `${LIM}/${folder}/${code}_EN.webp`];
  }
  return [`${LIM}/${folder}/${code}_EN.webp`, `${BANDAI}/${code}.png`];
}

// ── Image validation ──────────────────────────────────────────────────────────
// Checks the actual file bytes to confirm it is a real image.
// Rejects HTML error pages, tiny placeholder GIFs, and Bandai block responses.

function isRealImage(buf, contentType) {
  const bytes = new Uint8Array(buf);

  // Must be at least 512 bytes — real card images are 30–200KB
  if (bytes.length < 512) {
    return { ok: false, reason: `too small (${bytes.length} bytes)` };
  }

  // Reject if Content-Type is HTML (error page served as 200)
  if (contentType && contentType.includes('text/html')) {
    return { ok: false, reason: 'content-type is text/html' };
  }

  // Check magic bytes for known image formats
  // PNG: 89 50 4E 47
  const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  // JPEG: FF D8 FF
  const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  // WebP: RIFF....WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
              && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  // GIF: GIF87a or GIF89a
  const isGIF  = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;

  if (!isPNG && !isJPEG && !isWebP && !isGIF) {
    // Show first 16 bytes as hex for debugging
    const hex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2,'0')).join(' ');
    return { ok: false, reason: `not a valid image format — magic bytes: ${hex}` };
  }

  // Extra check: GIF images that are very small are likely placeholder/block responses
  // (Bandai returns a tiny 1×1 GIF when blocking hotlinks)
  if (isGIF && bytes.length < 2048) {
    return { ok: false, reason: `GIF too small (${bytes.length} bytes) — likely a block response` };
  }

  return { ok: true, format: isPNG ? 'PNG' : isJPEG ? 'JPEG' : isWebP ? 'WebP' : 'GIF' };
}

async function fetchValidImage(urls) {
  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FulcrumCards/1.0)',
          'Accept': 'image/webp,image/png,image/jpeg,image/*',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      console.log(`  [fetch error] ${url}: ${e.message}`);
      continue;
    }

    if (!res.ok) {
      console.log(`  [${res.status}] ${url}`);
      continue;
    }

    const ct  = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    const check = isRealImage(buf, ct);

    if (!check.ok) {
      console.log(`  [invalid] ${url}: ${check.reason}`);
      continue;
    }

    // Real image confirmed ✓
    return { buf, url, ct, format: check.format };
  }
  return null;
}

export default async () => {
  const started = Date.now();
  const store   = getStore('card-images');

  // Get already-cached keys
  let existing = new Set();
  try {
    const listed = await store.list();
    listed.blobs.forEach(b => existing.add(b.key));
  } catch (e) {
    console.warn('[warm-cards] Could not list existing blobs:', e.message);
  }

  const total   = CARD_CODES.length;
  const results = { cached: 0, skipped: 0, failed: [], invalid: [] };

  console.log(`[warm-cards] Starting. ${existing.size} cached, ${total - existing.size} to fetch.`);

  for (const code of CARD_CODES) {
    if (existing.has(code)) {
      results.skipped++;
      continue;
    }

    const hit = await fetchValidImage(srcUrls(code));

    if (!hit) {
      results.failed.push(code);
      console.warn(`[warm-cards] ✗ FAILED ${code} — not found on any CDN`);
    } else {
      await store.set(code, hit.buf, {
        metadata: {
          src:    hit.url,
          format: hit.format,
          bytes:  String(hit.buf.byteLength),
          at:     new Date().toISOString(),
        },
      });
      results.cached++;
      console.log(`[warm-cards] ✓ ${code} (${hit.format}, ${(hit.buf.byteLength/1024).toFixed(0)}KB) from ${hit.url.includes('limitless') ? 'Limitless' : 'Bandai'}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const summary = `Done in ${elapsed}s — ✓ ${results.cached} cached, ⏭ ${results.skipped} skipped, ✗ ${results.failed.length} failed`;
  console.log(`[warm-cards] ${summary}`);

  if (results.failed.length) {
    console.warn('[warm-cards] Failed codes:', results.failed.join(', '));
  }

  return new Response(JSON.stringify({ status: 'ok', summary, ...results }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { schedule: '0 3 * * 0' };
