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

  // 'OP01-120_p2'  → { base: 'OP01-120', suffix: '_p2' }
  // 'OP01-120'     → { base: 'OP01-120', suffix: ''     }
  function parseCode(code) {
    const m = code.match(/^([A-Z0-9]+-\d+)(_[a-zA-Z]\d+)?$/);
    return m ? { base: m[1], suffix: m[2] || '' } : null;
  }

  // Update window.PRICE_DB with one live price. Preserves nested-vs-flat shape
  // of whatever's already in PRICE_DB.
  function mergeOne(code, livePrice) {
    if (!window.PRICE_DB) return false;
    const parsed = parseCode(code);
    if (!parsed) return false;
    const { base, suffix } = parsed;
    const entry = window.PRICE_DB[base] || (window.PRICE_DB[base] = {});

    if (suffix) {
      // Targeted variant update — make sure the variant slot exists.
      if (!entry[suffix] || typeof entry[suffix] !== 'object') {
        entry[suffix] = { label: 'Variant ' + suffix.slice(1).toUpperCase() };
      }
      entry[suffix].en = livePrice;
    } else if (entry[''] && typeof entry[''] === 'object') {
      // Nested shape with a '' base variant slot
      entry[''].en = livePrice;
    } else {
      // Flat shape (or empty entry) — update the top-level en
      entry.en = livePrice;
    }
    return true;
  }

  // Walk every row that links to a card via openCardLookup('CODE') and
  // refresh its visible price cell from priceHeadline(code) — which now
  // reflects the live data we just merged.
  function refreshDom() {
    if (!window.priceHeadline) return 0;
    let n = 0;
    document.querySelectorAll('[onclick*="openCardLookup"]').forEach(el => {
      const m = el.getAttribute('onclick').match(/openCardLookup\(\s*'([^']+)'/);
      if (!m) return;
      const headline = window.priceHeadline(m[1]);
      if (!headline || !headline.en) return;
      // Common price-cell classes across the site
      const cell = el.querySelector('.price-cell, .col-price, td.col-price, td.price-cell');
      if (!cell) return;
      const cur = cell.textContent.trim();
      if (cur && cur !== headline.en) {
        cell.textContent = headline.en;
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

    let merged = 0;
    for (const code of Object.keys(data)) {
      if (code.startsWith('_')) continue;        // metadata: _updated, _cardCount, etc.
      const live = data[code] && data[code].en;
      if (live && mergeOne(code, live)) merged++;
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
    setStatus('✅ Live prices: ' + merged + ' cards merged · ' + domUpdates + ' tables refreshed · last scrape ' + when);
  }

  // Make the 🔄 button on index.html work (was previously calling an undefined function).
  window.refreshPrices = refresh;

  // Auto-run once on page load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
