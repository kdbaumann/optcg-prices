// public/data/live-prices.js
// Live price refresh — fetches /api/prices (filled by the daily scheduled
// update-prices.mjs scrape of OPCardlist) and merges the results into
// window.PRICE_DB, then walks the DOM to update visible price cells.
//
// Loaded after data/prices.js. Static prices.js is the offline fallback;
// when /api/prices is reachable, its values override the static ones.
//
// Also defines window.refreshPrices() so the existing 🔄 button works.

(function () {
  const API = '/api/prices';

  // ── Fix variant card images ────────────────────────────────────────────────
  // Every row authored with `data-bandai="CODE_pN"` was relying on a runtime
  // patch (which never existed) to rewrite the <img src> to the variant URL.
  // Without that, the page falls back to /card-img/<base-code> and shows the
  // wrong art (base print instead of Manga Alt / Red SAA / etc).
  //
  // We do that patch here, on DOMContentLoaded, before any price work runs.
  function fixVariantImages() {
    let n = 0;
    document.querySelectorAll('[data-bandai]').forEach(el => {
      const variantCode = el.dataset.bandai;
      if (!variantCode) return;
      const img = el.querySelector('img');
      if (!img) return;
      const want = '/card-img/' + variantCode;
      if (img.getAttribute('src') === want) return;     // already correct
      img.setAttribute('src', want);
      const fb = 'https://en.onepiece-cardgame.com/images/cardlist/card/' + variantCode + '.png';
      img.setAttribute(
        'onerror',
        "if(this.src!=='" + fb + "'){this.src='" + fb + "'}else{this.style.opacity='.2'}"
      );
      n++;
    });
    if (n > 0) console.log('[live-prices] fixed ' + n + ' variant card images');
    return n;
  }

  // 'OP01-120_p2'  → { base: 'OP01-120', suffix: '_p2' }
  // 'OP01-120'     → { base: 'OP01-120', suffix: ''     }
  function parseCode(code) {
    const m = code.match(/^([A-Z0-9]+-\d+)(_[a-zA-Z]\d+)?$/);
    return m ? { base: m[1], suffix: m[2] || '' } : null;
  }

  function priceNum(s) {
    if (s == null) return NaN;
    const n = parseFloat(String(s).replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  // Refuse to overwrite an existing curated price if the live value is much
  // lower (default >3×). The most common cause of a big drop is that the
  // live source is reporting a different variant than the static prices.js
  // entry — e.g. Limitless's "EB04-001" page only carries the OP-15 reprint
  // ($58) while prices.js holds the SP Gold Leader ($800). Letting the
  // overwrite go through would put $58 on the live site, which is wrong.
  function safeToMerge(existingEn, liveEn) {
    const oldVal = priceNum(existingEn);
    const newVal = priceNum(liveEn);
    if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) return true;
    if (oldVal <= 0 || newVal <= 0) return true;
    // Allow growth and reasonable drops; block big drops.
    if (oldVal / newVal > 3) return false;
    return true;
  }

  // Update window.PRICE_DB with one live price. Preserves nested-vs-flat shape
  // of whatever's already in PRICE_DB. Returns true if a merge was applied.
  function mergeOne(code, livePrice) {
    if (!window.PRICE_DB) return false;
    const parsed = parseCode(code);
    if (!parsed) return false;
    const { base, suffix } = parsed;
    const entry = window.PRICE_DB[base] || (window.PRICE_DB[base] = {});

    if (suffix) {
      // Targeted variant update. Suffix-tagged data is high-confidence
      // (OPCardlist scrape preserves _pN), so we apply unconditionally —
      // but if the slot already had an entry, still do the magnitude check.
      const prev = entry[suffix] && entry[suffix].en;
      if (prev && !safeToMerge(prev, livePrice)) {
        console.warn('[live-prices] skip ' + code + suffix + ': $' + priceNum(prev) + ' >> live $' + priceNum(livePrice));
        return false;
      }
      if (!entry[suffix] || typeof entry[suffix] !== 'object') {
        entry[suffix] = { label: 'Variant ' + suffix.slice(1).toUpperCase() };
      }
      entry[suffix].en = livePrice;
      return true;
    }

    // Top-level (flat or nested-with-empty-string base). Same magnitude check
    // applies — protects curated chase prices in flat-shape entries from
    // being downgraded by base-card data shipped under the same code.
    const prev = entry.en || (entry[''] && entry[''].en);
    if (prev && !safeToMerge(prev, livePrice)) {
      console.warn('[live-prices] skip ' + code + ': $' + priceNum(prev) + ' >> live $' + priceNum(livePrice));
      return false;
    }
    if (entry[''] && typeof entry[''] === 'object') {
      entry[''].en = livePrice;
    } else {
      entry.en = livePrice;
    }
    return true;
  }

  // Walk every row that links to a card via openCardLookup('CODE') and
  // refresh its visible price cell.
  //
  // Variant-aware: a row carrying data-bandai="CODE_pN" pins the cell to
  // that specific variant's price (so different rows for the same card
  // code can show different variant prices — e.g. OP13-118 _p2 manga at
  // $1,949 alongside _p3 Red SAA at $8,490). Without data-bandai we fall
  // back to priceHeadline (highest-priced variant for the code).
  //
  // Skips rows the renderer just painted (data-rendered="1") — those are
  // already drawing from the live PRICE_DB, no DOM rewrite needed.
  function refreshDom() {
    if (!window.priceHeadline) return 0;
    let n = 0;
    document.querySelectorAll('[onclick*="openCardLookup"]').forEach(el => {
      if (el.dataset && el.dataset.rendered === '1') return;  // renderer-owned
      const m = el.getAttribute('onclick').match(/openCardLookup\(\s*'([^']+)'/);
      if (!m) return;
      const code = m[1];

      // Variant-specific lookup if data-bandai is present and well-formed
      let priceText = null;
      const bandai = el.dataset && el.dataset.bandai;
      if (bandai && bandai.indexOf(code) === 0) {
        const suffix = bandai.slice(code.length);
        const entry  = window.PRICE_DB && window.PRICE_DB[code];
        const variant = entry && entry[suffix];
        if (variant && typeof variant === 'object' && variant.en) {
          priceText = variant.en;
        }
      }
      // Fall back to headline for rows without data-bandai or with a slot we
      // don't have data for.
      if (!priceText) {
        const headline = window.priceHeadline(code);
        if (headline && headline.en) priceText = headline.en;
      }
      if (!priceText) return;

      const cell = el.querySelector('.price-cell, .col-price, td.col-price, td.price-cell');
      if (!cell) return;
      const cur = cell.textContent.trim();
      if (cur && cur !== priceText) {
        cell.textContent = priceText;
        cell.dataset.live = '1';
        n++;
      }
    });
    return n;
  }

  // Render the small status line near the refresh button (if present).
  function setStatus(text) {
    const el = document.getElementById('refresh-status');
    if (el) el.textContent = text;
    if (typeof console !== 'undefined') console.log('[live-prices]', text);
  }

  async function refresh() {
    setStatus('🔄 Fetching latest prices…');
    let res;
    try {
      res = await fetch(API, { cache: 'no-store' });
    } catch (e) {
      setStatus('Could not reach /api/prices — using static data');
      return;
    }
    if (!res.ok) {
      setStatus('Price feed returned HTTP ' + res.status + ' — using static data');
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data) {
      setStatus('Price feed sent invalid JSON — using static data');
      return;
    }
    if (data._status === 'not_ready') {
      setStatus('Live price feed not warmed up yet — using static data');
      return;
    }
    if (data._status === 'error') {
      setStatus('Price feed error: ' + (data._message || 'unknown'));
      return;
    }

    // Expose the full feed so render-tables.js can use _bySet to enumerate
    // every code in a given set (not just the curated ones in PRICE_DB).
    window.LIVE_PRICES = data;

    let merged = 0;
    for (const code of Object.keys(data)) {
      if (code.startsWith('_')) continue;        // metadata: _updated, _cardCount, etc.
      const live = data[code] && data[code].en;
      if (live && mergeOne(code, live)) merged++;
    }

    // Re-render any dynamic top-N tables now that PRICE_DB has live prices.
    // Phase 2 wired this in but no section opts in yet — Phase 3 will.
    let rendered = 0;
    if (typeof window.renderAllTopN === 'function') {
      rendered = window.renderAllTopN() || 0;
    }

    const domUpdates = refreshDom();

    let when = 'unknown';
    if (data._updated) {
      const t = new Date(data._updated);
      const minsAgo = Math.round((Date.now() - t.getTime()) / 60000);
      when = minsAgo < 60 ? minsAgo + ' min ago'
           : minsAgo < 1440 ? Math.round(minsAgo / 60) + ' hr ago'
           : Math.round(minsAgo / 1440) + ' day(s) ago';
    }
    setStatus('✅ Live prices: ' + merged + ' merged · ' + rendered + ' rows rendered · ' + domUpdates + ' cells refreshed · last scrape ' + when);
  }

  // Make the 🔄 button on index.html work (was previously calling an undefined function).
  window.refreshPrices = refresh;

  // Auto-run once on page load: variant-image fix first, then price refresh.
  function init() {
    fixVariantImages();
    refresh();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
