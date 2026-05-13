// public/data/refresh-pack-prices.js
//
// Live-pricing refresher for pack-reference.html. Walks every .card-item
// panel and overwrites the hardcoded ".price-val" estimate with the
// current value from PRICE_DB (curated chase variants) + /api/prices
// (daily scrape).
//
// Mapping logic: each card-item has 1-2 .card-img-wrapper images (the
// participant + winner variants, or just one for cards distributed only
// as a single variant). The reference HTML puts a matching .price-row
// IN ORDER underneath. We pair them up by index — img[i] ↔ price-row[i] —
// and look up each variant's specific price via its img src code (which
// already encodes the variant suffix, e.g. /card-img/P-006_p1).
//
// Color class (.low/.mid/.high/.none) is recomputed based on the numeric
// dollar value so the visual hierarchy stays sensible as prices drift.
//
// Loaded by pack-reference.html after data/prices.js and
// data/live-prices.js. Runs on DOMContentLoaded, then again whenever
// live-prices.js completes a /api/prices merge.

(function () {
  // ── Parse /card-img/CODE → { base, suffix } ──────────────────────────────
  function parseImgSrc(url) {
    if (!url) return null;
    const m = url.match(/\/card-img\/([A-Z0-9]+-\d+)(_p\d+|_r\d+)?/);
    if (!m) return null;
    return { base: m[1], suffix: m[2] || '' };
  }

  // ── Lookup price for a specific variant — prefers live, falls back static ─
  function priceFor(base, suffix) {
    const fullCode = base + suffix;
    // Live first (daily scrape)
    const live = window.LIVE_PRICES && window.LIVE_PRICES[fullCode];
    if (live && live.en) return live.en;
    if (!suffix && live) {
      // some shapes nest the en string under the base code too
      if (typeof live === 'string') return live;
    }

    // PRICE_DB fallback
    const entry = window.PRICE_DB && window.PRICE_DB[base];
    if (!entry) return null;

    // Nested-variant shape: {  '': {...}, '_p1': {...}, '_p2': {...} }
    if (suffix && entry[suffix] && typeof entry[suffix] === 'object') {
      return entry[suffix].en || null;
    }
    // Nested base variant
    if (!suffix && entry[''] && typeof entry[''] === 'object') {
      return entry[''].en || null;
    }
    // Flat shape: { releasedIn, name, en, psa, ... }
    if (!suffix && typeof entry.en === 'string') return entry.en;

    return null;
  }

  // ── Numeric class for price ───────────────────────────────────────────────
  // Tournament pack prices range from a few dollars (common winner foils) up
  // to thousands (chase variants), so a coarse 3-bucket scale is enough.
  function priceClass(price) {
    const n = window.priceNum ? window.priceNum(price) : 0;
    if (n >= 100) return 'high';
    if (n >= 30)  return 'mid';
    if (n >    0) return 'low';
    return 'none';
  }

  // ── Walk every .card-item panel and refresh its .price-val cells ──────────
  function refresh() {
    if (!window.PRICE_DB) {
      console.warn('[pack-prices] PRICE_DB not loaded yet');
      return 0;
    }
    let updated = 0, panels = 0;
    document.querySelectorAll('.card-item').forEach(panel => {
      panels++;
      const imgs = panel.querySelectorAll('.card-img-wrapper img');
      const rows = panel.querySelectorAll('.price-table .price-row');
      const n = Math.min(imgs.length, rows.length);
      for (let i = 0; i < n; i++) {
        const parsed = parseImgSrc(imgs[i].getAttribute('src'));
        if (!parsed) continue;
        const price = priceFor(parsed.base, parsed.suffix);
        if (!price) continue;
        const cell = rows[i].querySelector('.price-val');
        if (!cell) continue;
        const cur = cell.textContent.trim();
        if (cur === price) continue;
        cell.textContent = price;
        cell.classList.remove('low', 'mid', 'high', 'none');
        cell.classList.add(priceClass(price));
        cell.dataset.live = '1';
        updated++;
      }
    });
    if (updated > 0 || panels > 0) {
      console.log(`[pack-prices] ${updated} cells refreshed across ${panels} panels`);
    }
    return updated;
  }

  // ── Wire into live-prices.js's refresh flow ───────────────────────────────
  // live-prices.js exposes window.refreshPrices for the manual 🔄 button.
  // We wrap it so our refresh also runs after every /api/prices merge.
  function wrap() {
    if (typeof window.refreshPrices === 'function' && !window.refreshPrices._packWrapped) {
      const orig = window.refreshPrices;
      const wrapped = async function () {
        const result = await orig.apply(this, arguments);
        refresh();
        return result;
      };
      wrapped._packWrapped = true;
      window.refreshPrices = wrapped;
    }
  }

  // ── Run on load + expose for manual refresh ───────────────────────────────
  function init() {
    refresh();        // first pass from static PRICE_DB
    wrap();           // wrap so future live merges trigger another pass

    // live-prices.js auto-runs on DOMContentLoaded and updates LIVE_PRICES
    // asynchronously. Re-refresh after a short delay to pick up the merge
    // in case the wrap missed it (e.g. if refreshPrices was redefined later).
    setTimeout(refresh,  500);
    setTimeout(refresh, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.refreshPackPrices = refresh;
})();
