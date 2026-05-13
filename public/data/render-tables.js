// public/data/render-tables.js
//
// Renderer for top-N set tables. Reads window.PRICE_DB (with releasedIn)
// + window.cardsForSet(), produces table rows, mounts into any
// <tbody data-render-set="opXX"> target in the DOM.
//
// Static set tables in index.html are unchanged for now. Phase 3 adopts
// the renderer per section by replacing a section's hand-authored rows
// with an empty <tbody data-render-set="opXX"></tbody> tag — at which
// point that section's content becomes derived from prices.js.
//
// Order of operations on page load:
//   1. data/prices.js — populates window.PRICE_DB
//   2. data/live-prices.js — fetches /api/prices, merges into PRICE_DB
//   3. data/render-tables.js (this file) — runs once on DOMContentLoaded
//      with whatever's in PRICE_DB. live-prices.js calls renderAllTopN()
//      again after its merge so the rendered prices reflect current data.

(function () {
  // ── label → rarity badge mapping ───────────────────────────────────────────
  // Keep this conservative. Unknown labels fall back to a neutral pill.

  function rarityClass(label) {
    const l = String(label || '').toLowerCase();
    if (l.includes('red saa') || l.includes('red super')) return 'r-sec';
    if (l.includes('manga'))                               return 'r-sec';
    if (l.includes('sp gold') || l.includes('sp silver') ||
        /\bsp\b/.test(l))                                  return 'r-sp';
    if (l.includes('parallel'))                            return 'r-par';
    if (l.includes('reprint') || l.includes('comic'))      return 'r-r';
    if (l.includes('base'))                                return 'r-r';
    return 'r-r';
  }

  function rarityShort(label) {
    const l = String(label || '').toLowerCase();
    if (l.includes('red saa') || l.includes('red super')) return 'RED SAA';
    if (l.includes('manga'))                               return 'SEC MANGA';
    if (l.includes('sp gold'))                             return 'SP GOLD';
    if (l.includes('sp silver'))                           return 'SP SILVER';
    if (l.includes('parallel'))                            return 'PARALLEL';
    if (l.includes('reprint') || l.includes('comic'))      return 'REPRINT';
    if (l.includes('base'))                                return 'BASE';
    return (label || '').toUpperCase().slice(0, 18);
  }

  // ── HTML escaping (defensive — labels and names come from data we control,
  //   but safer to escape than not) ────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Render one row as an HTML string ───────────────────────────────────────
  // item is the {code, suffix, name, variant, price} shape from cardsForSet().
  // Produces an 8-column row matching the OP-13 / OP-09 / etc. table layout:
  //   #  ·  Card  ·  Card #  ·  Rarity  ·  EN  ·  PSA 10  ·  BGS 10  ·  BGS BL
  // BGS 10 and BGS BL show '—' when prices.js doesn't have those values yet.
  // ── Rank-movement indicator ───────────────────────────────────────────────
  // window.PREV_RANKS, when populated, is { setKey: { fullCode: prevRank } }
  // built from a historical snapshot (default ~7 days ago). renderRow checks
  // each card's prior rank in its set and renders a small badge:
  //   NEW : wasn't in the historical top-N for this set
  //   ↑3  : moved up 3 spots
  //   ↓2  : moved down 2 spots
  //   —   : same rank (no badge)
  function rankDelta(setId, fullCode, currentRank) {
    const setMap = window.PREV_RANKS && window.PREV_RANKS[apiSetKey(setId)];
    if (!setMap) return '';
    const prev = setMap[fullCode];
    if (prev === undefined) {
      return ' <span class="rank-delta new" title="New to top-N">NEW</span>';
    }
    const delta = prev - currentRank;
    if (delta === 0) return '';
    const arrow = delta > 0 ? '↑' : '↓';
    const cls   = delta > 0 ? 'up' : 'down';
    return ` <span class="rank-delta ${cls}" title="Was #${prev}">${arrow}${Math.abs(delta)}</span>`;
  }

  function renderRow(item, rank, setId) {
    const fullCode = item.code + (item.suffix || '');
    const v        = item.variant;
    const en       = v.en    || '—';
    const psa      = v.psa   || '—';
    const bgs10    = v.bgs10 || '—';
    const bgsbl    = v.bgsbl || '—';
    const label    = v.label || '';
    const name     = item.name || label || item.code;
    const display  = label ? `${name} — ${label}` : name;
    const top3     = rank <= 3 ? ' top3' : '';
    const fb       = `https://en.onepiece-cardgame.com/images/cardlist/card/${fullCode}.png`;
    const delta    = setId ? rankDelta(setId, fullCode, rank) : '';

    return (
      `<tr style="cursor:pointer" onclick="openCardLookup('${esc(item.code)}')" ` +
        `data-bandai="${esc(fullCode)}" data-rendered="1">` +
        `<td class="rank-num${top3}">${rank}${delta}</td>` +
        `<td><div class="card-cell-inner">` +
          `<img class="card-thumb" src="/card-img/${esc(fullCode)}" alt="${esc(name)}" ` +
            `style="width:36px;height:50px;object-fit:cover;border-radius:4px;` +
            `border:1px solid #2a2a4a;background:#1e2035;flex-shrink:0;cursor:pointer" ` +
            `onerror="if(this.src!=='${fb}'){this.src='${fb}'}else{this.style.opacity='.2'}" ` +
            `onclick="openCardSearch('${esc(item.code)}')">` +
          `<div><div class="card-name-text">${esc(display)}</div>` +
          `<div class="card-sub-text">${esc(fullCode)}</div></div>` +
        `</div></td>` +
        `<td class="card-num">${esc(fullCode)}</td>` +
        `<td><span class="rarity-badge ${rarityClass(label)}">${esc(rarityShort(label))}</span></td>` +
        `<td class="price-cell">${esc(en)}</td>` +
        `<td class="grade-cell g-psa">${esc(psa)}</td>` +
        `<td class="grade-cell g-bgs">${esc(bgs10)}</td>` +
        `<td class="grade-cell g-bl">${esc(bgsbl)}</td>` +
      `</tr>`
    );
  }

  // ── Set-id normalization: front-end uses "op13", /api/prices uses "op-13" ─
  function apiSetKey(setId) {
    return setId.replace(/^(op|eb|prb|st)(\d+)$/, '$1-$2');
  }

  // Build the top-N candidate list for a given set by COMBINING two sources:
  //
  //   1. PRICE_DB (window.cardsForSet) — curated chase variants with rich
  //      metadata: BGS 10, BGS BL, JP, hand-written labels.
  //   2. /api/prices _bySet (window.LIVE_PRICES) — every code OPCardlist's
  //      scrape returned for that set. Comprehensive but bare-bones (just
  //      EN price, no grades, no labels beyond suffix-derived).
  //
  // PRICE_DB entries take precedence (richer metadata). Codes that appear
  // only in /api/prices get a basic stub. Result is sorted by EN price
  // descending, then sliced to top N.
  function candidatesForSet(setId) {
    const byKey = new Map();   // 'CODE' or 'CODE_pX' → item

    // (1) PRICE_DB pass — primary metadata source
    if (window.cardsForSet) {
      for (const item of window.cardsForSet(setId)) {
        byKey.set(item.code + (item.suffix || ''), item);
      }
    }

    // (2) /api/prices pass — fill in everything else from the scrape
    const live = window.LIVE_PRICES;
    if (live && live._bySet) {
      const codes = live._bySet[apiSetKey(setId)] || [];
      for (const fullCode of codes) {
        if (byKey.has(fullCode)) continue;   // already have rich data
        const m = fullCode.match(/^([A-Z]+\d+-\d+)(_[a-zA-Z]\d+)?$/);
        if (!m) continue;
        const baseCode = m[1];
        const suffix   = m[2] || '';
        const apiData  = live[fullCode];
        if (!apiData || !apiData.en) continue;

        // Pull whatever we can from PRICE_DB for nicer display.
        const pdEntry = window.PRICE_DB && window.PRICE_DB[baseCode];
        const pdVar   = pdEntry && pdEntry[suffix];

        // Skip cards explicitly tagged as tournament/promo in PRICE_DB.
        // Without this guard, /api/prices's per-set membership index would
        // surface tournament alt-arts (e.g. OP01-002_p4 3-on-3 Cup stamp) in
        // the OP-01 top-10 even though they're conceptually promos that
        // belong in tournament-guide.html.
        if (pdVar && pdVar.releasedIn === 'promos') continue;
        if (!pdVar && pdEntry && pdEntry.releasedIn === 'promos') continue;

        // ── De-duplication guard ─────────────────────────────────────────
        // PRICE_DB stores chase prices at the BASE code (e.g. OP01-003 holds
        // the $833 price for the OP01-003_p1 Parallel Foil chase). The live
        // scrape returns the same physical card under its variant code. When
        // we already have a PRICE_DB base-card row in this setId AND its
        // price is within ±15% of the incoming live variant, skip the live
        // row — it's the same card from a different angle and showing both
        // creates confusing duplicates with no extra info (live row has no
        // PSA/BGS data either).
        if (pdEntry && pdEntry.releasedIn === setId && byKey.has(baseCode)) {
          const baseItem  = byKey.get(baseCode);
          const livePrice = window.priceNum ? window.priceNum(apiData.en) : 0;
          const basePrice = baseItem.price || 0;
          if (basePrice > 0 && livePrice > 0) {
            const ratio = livePrice / basePrice;
            if (ratio >= 0.85 && ratio <= 1.15) continue;
          }
        }

        // Name preference: PRICE_DB > scraper-provided name > base code as last resort.
        // The scraper now captures `name` from OPCardlist's RSC stream so codes
        // that aren't in PRICE_DB (e.g. OP13-080 Imu / Demon Pack) still display
        // a real character name.
        const name = (pdEntry && pdEntry.name) || apiData.name || baseCode;

        byKey.set(fullCode, {
          code:    baseCode,
          suffix,
          name,
          variant: {
            releasedIn: setId,
            en:         apiData.en,
            psa:        (pdVar && pdVar.psa)   || '',
            bgs10:      (pdVar && pdVar.bgs10) || '',
            bgsbl:      (pdVar && pdVar.bgsbl) || '',
            label:      (pdVar && pdVar.label) || (suffix ? 'Variant ' + suffix.slice(1).toUpperCase() : 'Base'),
          },
          price:   window.priceNum ? window.priceNum(apiData.en) : 0,
        });
      }
    }

    return [...byKey.values()].sort((a, b) => b.price - a.price);
  }

  // ── Mount: find every [data-render-set] tbody and fill it with top-N ──────
  function renderAllTopN(n) {
    n = (typeof n === 'number' && n > 0) ? n : 10;
    if (!window.cardsForSet && !window.LIVE_PRICES) {
      console.warn('[render-tables] no data sources available — load prices.js or wait for /api/prices');
      return 0;
    }
    let total = 0, sectionCount = 0;
    document.querySelectorAll('[data-render-set]').forEach(target => {
      const setId = target.dataset.renderSet;
      if (!setId) return;
      const cands = candidatesForSet(setId);
      if (!cands.length) {
        target.innerHTML = '';     // genuinely empty (e.g. OP-15 before scrape)
        return;
      }
      const top = cands.slice(0, n);
      target.innerHTML = top.map((item, i) => renderRow(item, i + 1, setId)).join('');
      sectionCount++;
      total += top.length;
    });
    if (sectionCount > 0) {
      console.log(`[render-tables] rendered ${total} rows across ${sectionCount} sections`);
    }
    return total;
  }

  // ── Load a historical snapshot, derive per-set ranks, re-render ─────────
  // Powers the ↑/↓/NEW indicators in renderRow. Pulls one snapshot from ~N
  // days ago (default 7), groups its codes by set via _bySet (or by prefix
  // when _bySet is absent in compact snapshots), sorts each bucket by
  // numeric price, and stores the ranks in window.PREV_RANKS for renderRow
  // to consult. Fails gracefully when snapshots haven't accumulated yet
  // (renderRow just renders without indicators).
  function daysAgoISO(n) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
  async function loadPrevRanks(daysBack) {
    const days = (typeof daysBack === 'number' && daysBack > 0) ? daysBack : 7;
    try {
      const r = await fetch('/api/snapshot?date=' + daysAgoISO(days), { cache: 'force-cache' });
      if (!r.ok) return false;
      const snap = await r.json();
      if (!snap || snap._status === 'not_found') return false;

      // Group codes by set bucket, then sort by parsed price desc.
      const bucketCodes = {};
      if (snap._bySet) {
        for (const [bucket, codes] of Object.entries(snap._bySet)) {
          bucketCodes[bucket] = codes.slice();
        }
      } else {
        // Compact snapshot — derive buckets from code prefix.
        for (const code of Object.keys(snap)) {
          if (code.startsWith('_')) continue;
          const m = code.match(/^([A-Z]+)(\d+)/);
          if (!m) continue;
          const bucket = (m[1] + '-' + m[2]).toLowerCase();
          if (!bucketCodes[bucket]) bucketCodes[bucket] = [];
          bucketCodes[bucket].push(code);
        }
      }

      const prev = {};
      for (const [bucket, codes] of Object.entries(bucketCodes)) {
        const enriched = codes.map(c => {
          const v = snap[c];
          const enStr = typeof v === 'string' ? v : (v && v.en);
          return { code: c, price: window.priceNum ? window.priceNum(enStr) : 0 };
        }).filter(x => x.price > 0);
        enriched.sort((a, b) => b.price - a.price);
        prev[bucket] = {};
        enriched.forEach((x, i) => { prev[bucket][x.code] = i + 1; });
      }

      window.PREV_RANKS = prev;
      renderAllTopN();   // re-render to surface the indicators
      return true;
    } catch (e) {
      console.warn('[render-tables] previous-rank load failed:', e.message || e);
      return false;
    }
  }

  // Expose the API
  window.renderTopN     = function (setId, n) {
    if (!window.cardsForSet) return [];
    return window.cardsForSet(setId).slice(0, (typeof n === 'number' && n > 0) ? n : 10);
  };
  window.renderRow      = renderRow;
  window.renderAllTopN  = renderAllTopN;
  window.loadPrevRanks  = loadPrevRanks;

  // Auto-run once on page load. live-prices.js will trigger another pass
  // after it merges /api/prices. We also kick off an async historical-rank
  // fetch — when it returns, the table re-renders with movement indicators.
  function init() {
    renderAllTopN();
    loadPrevRanks(7);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
