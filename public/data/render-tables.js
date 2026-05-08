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
  function renderRow(item, rank) {
    const fullCode = item.code + (item.suffix || '');
    const v        = item.variant;
    const en       = v.en  || '—';
    const psa      = v.psa || '';
    const label    = v.label || '';
    const name     = item.name || label || item.code;
    const display  = label ? `${name} — ${label}` : name;
    const top3     = rank <= 3 ? ' top3' : '';
    const fb       = `https://en.onepiece-cardgame.com/images/cardlist/card/${fullCode}.png`;
    const note     = v.note || '';

    return (
      `<tr style="cursor:pointer" onclick="openCardLookup('${esc(item.code)}')" ` +
        `data-bandai="${esc(fullCode)}" data-rendered="1">` +
        `<td class="rank-num${top3}">${rank}</td>` +
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
        `<td class="col-notes">${esc(note)}</td>` +
      `</tr>`
    );
  }

  // ── Mount: find every [data-render-set] tbody and fill it with top-N ──────
  function renderAllTopN(n) {
    n = (typeof n === 'number' && n > 0) ? n : 10;
    if (!window.cardsForSet) {
      console.warn('[render-tables] window.cardsForSet missing — load data/prices.js first');
      return 0;
    }
    let total = 0, sectionCount = 0;
    document.querySelectorAll('[data-render-set]').forEach(target => {
      const setId = target.dataset.renderSet;
      if (!setId) return;
      const cards = window.cardsForSet(setId);
      if (!cards.length) {
        target.innerHTML = '';  // empty section is fine (e.g. OP-15 with no data yet)
        return;
      }
      const top = cards.slice(0, n);
      target.innerHTML = top.map((item, i) => renderRow(item, i + 1)).join('');
      sectionCount++;
      total += top.length;
    });
    if (sectionCount > 0) {
      console.log(`[render-tables] rendered ${total} rows across ${sectionCount} sections`);
    }
    return total;
  }

  // Expose the API
  window.renderTopN     = function (setId, n) {
    if (!window.cardsForSet) return [];
    return window.cardsForSet(setId).slice(0, (typeof n === 'number' && n > 0) ? n : 10);
  };
  window.renderRow      = renderRow;
  window.renderAllTopN  = renderAllTopN;

  // Auto-run once on page load. live-prices.js will trigger another pass
  // after it merges /api/prices.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderAllTopN(); });
  } else {
    renderAllTopN();
  }
})();
