// netlify/functions/card-img-admin.mjs
//
// Tiny admin endpoint for hand-curating /card-img/ overrides when the
// automated eBay scrape (source-missing-art-background.mjs) returns the
// wrong image, or for variants no scrape can find.
//
// Auth: requires env var ADMIN_TOKEN; pass via ?token= query param OR
// X-Admin-Token header. Without ADMIN_TOKEN set, every action returns 403
// (defense against accidentally-public deploys).
//
// Routes:
//   GET  /card-img-admin                          — JSON status, lists every
//                                                   manual-override key
//   POST /card-img-admin?code=X&url=https://...   — fetch URL, validate
//                                                   it's an image, store
//                                                   in card-images-manual
//                                                   under `code`
//   DELETE /card-img-admin?code=X                 — remove the override so
//                                                   the proxy falls back
//                                                   to the CDN chain again
//
// All bodies are JSON. The companion HTML page is /card-img-admin.html.

import { getStore } from '@netlify/blobs';

const UA = 'Mozilla/5.0 (compatible; FulcrumAdmin/1.0)';

function isRealImage(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 1024) return false;
  const isPNG  = b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47;
  const isJPEG = b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF;
  const isWebP = b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46
              && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50;
  return isPNG || isJPEG || isWebP;
}

function ok(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  const url = new URL(req.url);

  // ── Auth ──────────────────────────────────────────────────────────────
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return ok({ error: 'admin_disabled', message:
      'Set ADMIN_TOKEN env var in Netlify to enable this endpoint.' }, 403);
  }
  const provided = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (provided !== adminToken) {
    return ok({ error: 'unauthorized' }, 403);
  }

  const store = getStore('card-images-manual');

  // ── GET: list all manual overrides ───────────────────────────────────
  if (req.method === 'GET') {
    const list = await store.list({});
    const blobs = (list && list.blobs) || [];
    const items = [];
    for (const b of blobs.slice(0, 500)) {
      const meta = await store.getMetadata(b.key).catch(() => null);
      items.push({ code: b.key, ...(meta && meta.metadata) });
    }
    items.sort((a, b) => a.code.localeCompare(b.code));
    return ok({ count: blobs.length, items });
  }

  // ── POST: store a manual override ─────────────────────────────────────
  if (req.method === 'POST') {
    const code   = (url.searchParams.get('code') || '').trim().toUpperCase();
    const imgUrl = url.searchParams.get('url') || '';
    if (!/^[A-Z0-9-]+(_p\d+|_r\d+)?$/.test(code)) return ok({ error: 'invalid_code' }, 400);
    if (!/^https?:\/\//.test(imgUrl)) return ok({ error: 'invalid_url' }, 400);
    let resp;
    try {
      resp = await fetch(imgUrl, {
        headers: { 'User-Agent': UA },
        signal:  AbortSignal.timeout(15_000),
      });
    } catch (e) {
      return ok({ error: 'fetch_fail', message: e.message }, 502);
    }
    if (!resp.ok) return ok({ error: 'http_' + resp.status }, 502);
    const buf = await resp.arrayBuffer();
    if (!isRealImage(buf)) return ok({ error: 'not_an_image', size: buf.byteLength }, 422);
    await store.set(code, buf, {
      metadata: {
        source:    'admin',
        srcUrl:    imgUrl,
        storedAt:  new Date().toISOString(),
        size:      buf.byteLength,
      },
    });
    return ok({ ok: true, code, size: buf.byteLength });
  }

  // ── DELETE: remove a manual override ──────────────────────────────────
  if (req.method === 'DELETE') {
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code) return ok({ error: 'missing_code' }, 400);
    await store.delete(code);
    return ok({ ok: true, code, deleted: true });
  }

  return ok({ error: 'method_not_allowed' }, 405);
};

export const config = { path: '/card-img-admin' };
