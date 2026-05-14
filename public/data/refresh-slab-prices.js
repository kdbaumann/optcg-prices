// public/data/refresh-slab-prices.js
//
// Loads /api/slabs into window.SLAB_PRICES and triggers a re-render of any
// top-N tables so PSA 10 / BGS 10 / BGS BL columns populate from the daily
// Claude+web_search slab refresh (refresh-slabs-background.mjs).
//
// Without this, the slab data the function collects sits in the Blob store
// unused — the renderer only sees PRICE_DB grade fields, which are
// hand-curated and cover only ~30 cards. SLAB_PRICES typically covers
// 100+ chase variants with eBay/alt.xyz/fanaticscollect-sourced data.
//
// Lookup shape after this loads:
//   window.SLAB_PRICES['OP13-118_p3'] = {
//     psa10: { price: '$24,000', count: 8, source: 'eBay sold 30d' },
//     bgs10: { price: '$32,000', count: 3, source: 'eBay + alt.xyz' },
//     bgsbl: { price: null, count: 0, source: 'no recent sales' }
//   }

(function () {
  function refresh() {
    return fetch('/api/slabs', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data._status === 'not_ready' || data._status === 'error') {
          console.log('[slab-prices] not ready:', data && data._status);
          return 0;
        }
        // Strip metadata keys; keep only card entries.
        const out = {};
        let n = 0;
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('_') || k === 'slabs') continue;
          if (v && typeof v === 'object' && (v.psa10 || v.bgs10 || v.bgsbl)) {
            out[k] = v;
            n++;
          }
        }
        window.SLAB_PRICES = out;
        console.log('[slab-prices] loaded ' + n + ' slab entries · last update ' + (data._updated || 'unknown'));

        // Re-render top-N tables so the renderer's slab fallback kicks in.
        if (typeof window.renderAllTopN === 'function') window.renderAllTopN();
        return n;
      })
      .catch(e => {
        console.warn('[slab-prices] fetch failed:', e.message || e);
        return 0;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }

  // Expose for the manual refresh button on index.html
  window.refreshSlabPrices = refresh;
})();
