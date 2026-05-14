// public/data/badge-fallback-imgs.js
//
// Adds a small "BASE ART — no stamped scan available" badge to any
// /card-img/{code}_pN or _rN thumbnail whose variant doesn't actually exist
// on any public CDN. The /card-img/ proxy transparently falls back to the
// base card art for missing variants (see netlify/functions/card-img.mjs)
// so the user sees the right character — but for tournament-stamped
// variants where the stamp version doesn't exist anywhere publicly, the
// displayed image is actually the un-stamped base. This badge makes that
// honest at a glance.
//
// Implementation: pure client-side. Probes Limitless EN → Bandai EN →
// Limitless JP directly for each variant code we see in the DOM. If all
// three real-CDN probes fail, mark the corresponding thumbnail as
// fallback. Probes are cached per-session in window.__cardImgFallbackCache
// so we never probe the same code twice. Decoupled from rendering — runs
// after DOMContentLoaded and again when the page DOM mutates.

(function () {
  const LIM = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece';
  const EN  = 'https://en.onepiece-cardgame.com/images/cardlist/card';

  // Cache: full code → 'real' | 'fallback' | 'pending'
  if (!window.__cardImgFallbackCache) window.__cardImgFallbackCache = {};
  const cache = window.__cardImgFallbackCache;

  function probeChain(code) {
    const m = code.match(/^([A-Z]+\d+)/);
    const folder = m ? m[1] : (code.startsWith('P-') ? 'P' : 'OP01');
    return code.startsWith('P-')
      ? [`${LIM}/P/${code}_EN.webp`, `${EN}/${code}.png`, `${LIM}/P/${code}_JP.webp`]
      : [`${LIM}/${folder}/${code}_EN.webp`, `${EN}/${code}.png`, `${LIM}/${folder}/${code}_JP.webp`];
  }

  function probe(code) {
    return new Promise(resolve => {
      const urls = probeChain(code);
      let i = 0;
      function next() {
        if (i >= urls.length) return resolve('fallback');
        const img = new Image();
        img.onload  = () => img.naturalWidth > 0 ? resolve('real') : (i++, next());
        img.onerror = () => { i++; next(); };
        img.src = urls[i];
      }
      next();
    });
  }

  function injectBadge(img) {
    if (img.dataset.fallbackBadged === '1') return;
    img.dataset.fallbackBadged = '1';
    // Wrap the img in a positioned container so we can absolutely-position
    // the badge. If the parent is already position:relative we can attach
    // directly; otherwise we add a wrapper.
    const parent = img.parentElement;
    if (!parent) return;
    const cs = getComputedStyle(parent);
    let host = parent;
    if (cs.position === 'static') {
      // Wrap in a span so we don't disrupt layout.
      const span = document.createElement('span');
      span.style.cssText = 'position:relative;display:inline-block;line-height:0';
      parent.insertBefore(span, img);
      span.appendChild(img);
      host = span;
    } else if (cs.position && cs.position !== 'absolute' && cs.position !== 'fixed') {
      // already positioned, attach to parent
    }
    const badge = document.createElement('span');
    badge.textContent = 'BASE ART';
    badge.title = "No stamped/alt-art scan is published on any public CDN for this variant — showing base art so you can recognize the character. The actual stamped card looks different in person.";
    badge.style.cssText = [
      'position:absolute',
      'bottom:2px',
      'left:2px',
      'font-family:"JetBrains Mono",monospace',
      'font-size:8px',
      'font-weight:700',
      'letter-spacing:0.5px',
      'padding:1px 4px',
      'background:rgba(245,158,11,0.92)',
      'color:#1a1a2e',
      'border-radius:2px',
      'pointer-events:auto',
      'cursor:help',
      'z-index:2',
      'white-space:nowrap',
    ].join(';');
    host.appendChild(badge);
  }

  // For each /card-img/{code} URL, extract the variant code we'd probe.
  // We only badge variants (_pN / _rN) — base-code images don't have the
  // ambiguity.
  function codeFromImg(img) {
    const src = img.getAttribute('src') || '';
    const m = src.match(/\/card-img\/([A-Z0-9]+-\d+(?:_p\d+|_r\d+)?)/);
    if (!m) return null;
    const code = m[1];
    if (!/_p\d+$|_r\d+$/.test(code)) return null;     // base code — never a fallback
    return code;
  }

  async function checkOne(img) {
    const code = codeFromImg(img);
    if (!code) return;
    const cached = cache[code];
    if (cached === 'real')     return;
    if (cached === 'fallback') return injectBadge(img);
    if (cached === 'pending')  return;     // another img is already probing
    cache[code] = 'pending';
    const result = await probe(code);
    cache[code] = result;
    if (result === 'fallback') {
      // Badge ALL imgs that point at this same code (e.g., gallery + thumb)
      document.querySelectorAll('img[src*="/card-img/' + code + '"]').forEach(injectBadge);
    }
  }

  function scan() {
    document.querySelectorAll('img[src*="/card-img/"]').forEach(checkOne);
  }

  // Initial scan + watch for re-renders (the top-N renderer rebuilds tbodies)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  // Re-scan after the renderer finishes any deferred work (lookups, live merge).
  setTimeout(scan, 2000);
  setTimeout(scan, 6000);

  window.recheckCardImgFallbacks = scan;
})();
