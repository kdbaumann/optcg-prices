// public/data/prices.js
// CANONICAL PRICE DATA — single source of truth for the entire site.
//
// Shape per entry:
//   'CARD-CODE': { releasedIn, name, en, psa, jp, note }                ← single-variant (flat)
// OR:
//   'CARD-CODE': { name?, '': {...}, '_p1': {...}, '_p2': {...}, ... }  ← multi-variant (nested)
//
// Each variant carries its OWN releasedIn — anniversary / reprint variants
// are distributed in different sets than the base card. Example:
//   'OP05-119': {
//     '_p2': { releasedIn:'op05', en:'$190', label:'Manga Alt' },
//     '_p7': { releasedIn:'op11', en:'$3,761', label:'3rd Anniv SP Gold' },
//   }
//
// Special releasedIn values:
//   'promos' — tournament / championship / event-pack distribution;
//              NOT pulled from any main-set pack. Excluded from main-set
//              top-10 lists; surfaces in the dedicated promos section.
//
// Suffixes: '' = base · '_p1' SR parallel · '_p2' manga alt · '_p3' Red SAA
//           '_p4' TC stamp · '_p5'/'_p6'/'_p7'/'_p8' SP variants · '_r1'/'_r2' reprints
//
// Loaded by: index.html, tournament-guide.html, card-lookup.html

window.PRICE_DB = {
  // ── OP-01 (Romance Dawn) ────────────────────────────────────────────
  'OP01-120': {
    name: 'Shanks',
    '':    { releasedIn:'op01', en:'$8',   label:'Base Shanks MR' },
    '_p1': { releasedIn:'op01', en:'$107', psa:'$320',   label:'SR Parallel' },
    '_p2': { releasedIn:'op01', en:'$776', psa:'$2,200', label:'Manga Alt Art (SEC★)' },
  },
  'OP01-003': { releasedIn:'op01', name:'Monkey D. Luffy', en:'$833', psa:'$2,800', jp:'¥120k (≈$839)', note:'Leader Parallel (_p1) · Feb 2026 OPCardlist' },
  'OP01-016': { releasedIn:'op01', name:'Nami', en:'$454', psa:'$1,400', jp:'¥65k (≈$455)', note:'SR Parallel (_p1) · strong demand' },

  // ── OP-02 (Paramount War) — only Championship promos in PRICE_DB ────
  'OP02-099': { releasedIn:'promos', name:'Sakazuki', en:'$1,300', psa:'$3,500', jp:'¥150,000 (≈$1,050)', note:'Championship 2023 stamp' },
  'OP02-096': { releasedIn:'promos', name:'Kuzan',    en:'$1,000', psa:'$5,450', jp:'¥120,000 (≈$840)',  note:'Championship 2023 stamp' },
  'OP02-097': { releasedIn:'promos', name:'Kizaru',   en:'$500',   psa:'$1,500', jp:'¥80,000 (≈$559)',   note:'Championship 2023 promo' },

  // ── OP-03 (Pillars of Strength) ─────────────────────────────────────
  // OP03-122 entry below is the PRB-01 Comic Parallel reprint, NOT the OP-03 base.
  'OP03-122': { releasedIn:'prb01', name:'Sogeking', en:'$426', psa:'$1,278', jp:'¥62k (≈$433)', note:'Comic Parallel PRB-01 (_r1)' },

  // ── OP-04 (Kingdoms of Intrigue) ────────────────────────────────────
  'OP04-083': { releasedIn:'prb01', name:'Sabo', en:'$399', psa:'$1,197', jp:'¥58k (≈$406)', note:'Comic Parallel PRB-01 (_r1)' },

  // ── OP-05 (Awakening) — Gear 5 Luffy with cross-set anniversary variants ──
  'OP05-119': {
    name: 'Monkey D. Luffy',
    '':    { releasedIn:'op05',   en:'$14',    label:'Base Gear 5 Luffy' },
    '_p1': { releasedIn:'op05',   en:'$190',   psa:'$570',    label:'SR Parallel Foil' },
    '_p2': { releasedIn:'op05',   en:'$190',   psa:'$570',    label:'Manga Alt (SEC parallel)' },
    '_p4': { releasedIn:'promos', en:'$256',   psa:'$768',    label:'TC Promo Stamp' },
    '_p7': { releasedIn:'op11',   en:'$3,761', psa:'$11,283', label:'3rd Anniversary SP Gold (OP-11)' },
    '_p8': { releasedIn:'op11',   en:'$2,133', psa:'$6,399',  label:'3rd Anniversary SP Silver (OP-11)' },
    '_r2': { releasedIn:'prb01',  en:'$2,682', psa:'$8,046',  label:'PRB-01 Comic Parallel Reprint' },
  },

  // ── OP-06 (Wings of the Captain) ────────────────────────────────────
  'OP06-118': { releasedIn:'op06', name:'Roronoa Zoro', en:'$1,928', psa:'$6,750', jp:'¥280k (≈$1,958)', note:'Manga Alt (_p2) · OPCardlist Feb 2026' },

  // ── OP-07 (500 Years in the Future) ─────────────────────────────────
  'OP07-051': { releasedIn:'op07', name:'Boa Hancock', en:'$710', psa:'$2,100', jp:'¥105k (≈$734)', note:'SP variant (_p3) · Manga Alt (_p2) = $2,192' },

  // ── OP-08 (Two Legends) ─────────────────────────────────────────────
  'OP08-118': { releasedIn:'op08', name:'Silvers Rayleigh', en:'$500', psa:'$1,600', jp:'¥80,000 (≈$560)', note:'OP-08 SEC★ Manga Rare' },

  // ── OP-09 (Emperors) — Gold Manga Rares + cross-set anniversary variants ──
  'OP09-118': { releasedIn:'op09', name:'Gol D. Roger',     en:'$3,574', psa:'$10,000', jp:'¥520k (≈$3,636)',     note:'Gold Manga Rare (_p2) · Feb 2026 OPCardlist' },
  'OP09-119': { releasedIn:'op09', name:'Monkey D. Luffy',  en:'$2,950', psa:'$8,500',  jp:'¥190,000 (≈$1,329)',  note:'OP-09 Gold Emperor SEC' },

  'OP09-051': {
    name: 'Buggy',
    '':    { releasedIn:'op09', en:'$35',    label:'Base Buggy' },
    '_p1': { releasedIn:'op09', en:'$36',    label:'Parallel Foil' },
    '_p2': { releasedIn:'op09', en:'$939',   psa:'$2,800', label:'SP Gold (2nd Anniversary)' },
    '_p4': { releasedIn:'op14', en:'$2,649', psa:'$7,947', label:'SP Gold (3rd Anniversary — OP-14)' },
    '_p5': { releasedIn:'op14', en:'$1,328', psa:'$3,984', label:'SP Silver (3rd Anniversary — OP-14)' },
  },
  'OP09-093': {
    name: 'Marshall D. Teach',
    '':    { releasedIn:'op09', en:'$34',  label:'Base Blackbeard' },
    '_p1': { releasedIn:'op09', en:'$34',  label:'Parallel Foil' },
    '_p2': { releasedIn:'op09', en:'$944', psa:'$2,832', label:'SP Gold (2nd Anniversary)' },
    '_p3': { releasedIn:'op12', en:'$181', psa:'$543',   label:'SP Silver (3rd Anniversary — OP-12)' },
    '_p4': { releasedIn:'op12', en:'$572', psa:'$1,716', label:'SP Gold (3rd Anniversary — OP-12)' },
  },
  'OP09-004': {
    name: 'Shanks',
    '':    { releasedIn:'op09', en:'$22',    label:'Base Leader' },
    '_p1': { releasedIn:'op09', en:'$22',    label:'Leader Parallel' },
    '_p2': { releasedIn:'op09', en:'$1,203', psa:'$3,600', label:'SP Gold (2nd Anniversary)' },
    '_p3': { releasedIn:'op09', en:'$301',   psa:'$900',   label:'SP Silver (2nd Anniversary)' },
    '_p5': { releasedIn:'op13', en:'$1,545', psa:'$4,635', label:'SP Gold (3rd Anniversary — OP-13)' },
    '_p6': { releasedIn:'op13', en:'$982',   psa:'$2,946', label:'SP Silver (3rd Anniversary — OP-13)' },
  },

  // ── OP-10 / OP-11 / OP-12 main-set chases ───────────────────────────
  'OP10-119': { releasedIn:'op10',   name:'Trafalgar Law',  en:'$500', psa:'$1,800', jp:'¥90,000 (≈$629)', note:'OP-10 SEC★ Manga Rare' },
  'OP11-118': { releasedIn:'op11',   name:'Monkey D. Luffy', en:'$310', psa:'$900', jp:'¥40,000 (≈$280)', note:'OP-11 SEC★ Manga Rare' },
  'OP12-118': { releasedIn:'op12',   name:'Jewelry Bonney', en:'$800', psa:'$2,500', jp:'¥60,000 (≈$420)', note:'OP-12 SEC★ Manga Rare' },
  'OP12-020': { releasedIn:'promos', name:'Roronoa Zoro',   en:'$1,500–$3,000', psa:'$6,000', jp:'¥200,000 (≈$1,399)', note:'Serial # card — TC Top 4 prize' },

  // ── OP-13 (Carrying On His Will) — Red SAA flagship ─────────────────
  'OP13-118': {
    name: 'Monkey D. Luffy (Red SAA)',
    '':    { releasedIn:'op13',   en:'$76',    psa:'$228',    label:'Base Parallel Leader' },
    '_p2': { releasedIn:'op13',   en:'$1,949', psa:'$5,847',  label:'Manga Alt Art' },
    '_p3': { releasedIn:'op13',   en:'$8,490', psa:'$24,100', label:'Red Super Alt Art (SEC★)' },
    '_p4': { releasedIn:'promos', en:'$476',   psa:'$1,428',  label:'TC Promo Top 16' },
  },
  'OP13-119': { releasedIn:'op13', name:'Portgas D. Ace', en:'$4,420', psa:'$12,000', jp:'¥640k (≈$4,476)', note:'Red SAA (_p3) · Manga Alt (_p2) = $1,198' },
  'OP13-120': { releasedIn:'op13', name:'Sabo',           en:'$4,750', psa:'$14,000', jp:'¥690k (≈$4,825)', note:'Red SAA (_p3) · Manga Alt (_p2) = $847' },

  // ── OP-14 (Azure Sea's Seven) ───────────────────────────────────────
  'OP14-119': {
    name: 'Dracule Mihawk',
    '':    { releasedIn:'op14', en:'$46',    psa:'$138',   label:'Base Mihawk' },
    '_p2': { releasedIn:'op14', en:'$1,400', psa:'$4,200', label:'Manga Alt Art (SEC★)' },
  },

  // ── EB-01 (Memorial Collection) ─────────────────────────────────────
  'EB01-006': {
    name: 'Tony Tony Chopper',
    '':    { releasedIn:'eb01',  en:'$23',    psa:'$68',    label:'Base Chopper MR' },
    '_p1': { releasedIn:'eb01',  en:'$67',    psa:'$201',   label:'SR Parallel Foil' },
    '_p2': { releasedIn:'eb01',  en:'$1,973', psa:'$6,000', label:'SEC★ Manga Art' },
    '_r1': { releasedIn:'prb01', en:'$1,484', psa:'$4,452', label:'PRB-01 Comic Parallel Reprint' },
  },

  // ── EB-02 (Anime 25th) / EB-03 (Heroines) ───────────────────────────
  'EB02-061': { releasedIn:'eb02', name:'Monkey D. Luffy', en:'$3,000', psa:'$10,000', jp:'¥85,000 (≈$594)', note:'EB-02 SP Leader — Gear 2 anniversary' },
  'EB03-053': {
    name: 'Nami',
    '':    { releasedIn:'eb03', en:'$38',    psa:'$114',   label:'Base Nami' },
    '_p1': { releasedIn:'eb03', en:'$136',   psa:'$408',   label:'SR Parallel Foil' },
    '_p2': { releasedIn:'eb03', en:'$1,725', psa:'$5,175', label:'SEC★ Manga Art' },
  },
  'EB03-061': { releasedIn:'eb03', name:'Uta',        en:'$1,536', psa:'$4,608', jp:'¥222k (≈$1,553)', note:'SEC★ Manga Art (_p2)' },
  'EB03-055': { releasedIn:'eb03', name:'Nico Robin', en:'$650',   psa:'$2,000', jp:'¥120,000 (≈$839)', note:'Heroines SEC' },

  // ── EB-04 (Heroines New World — distributed in OP-14/OP-15 packs) ───
  'EB04-001': { releasedIn:'eb04', name:'Nami',           en:'$800', psa:'$2,800', jp:'¥120,000 (≈$839)', note:'SP Gold Leader — Heroines New World' },
  'EB04-059': { releasedIn:'eb04', name:'Monkey D. Luffy', en:'$400', psa:'$1,200', jp:'¥60,000 (≈$420)',  note:'Manga Alt Art — EB-04' },
  'EB04-060': { releasedIn:'eb04', name:'Nico Robin',      en:'$500', psa:'$1,500', jp:'¥70,000 (≈$490)',  note:'SEC★ Manga Rare — Heroines New World' },
  'EB04-061': { releasedIn:'eb04', name:'Nami',            en:'$600', psa:'$1,800', jp:'¥90,000 (≈$629)',  note:'SEC★ Manga Rare — Heroines New World (top chase)' },
  'EB04-062': { releasedIn:'eb04', name:'Boa Hancock',     en:'$450', psa:'$1,350', jp:'¥65,000 (≈$455)',  note:'SEC★ Manga Rare — Heroines New World' },
  'EB04-044': { releasedIn:'eb04', name:'Koby',            en:'$800', psa:'$2,500', jp:'¥120,000 (≈$839)', note:'SEC★ Manga Rare — EB-04 chase card' },

  // ── ST-set tournament prizes (no pack distribution) ─────────────────
  'ST01-013': { releasedIn:'promos', name:'Roronoa Zoro',    en:'$3,000–$5,800', psa:'$21,600',  jp:'¥400,000 (≈$2,797)', note:'Treasure Cup Top 8 stamp — record PSA 10' },
  'ST01-001': { releasedIn:'promos', name:'Monkey D. Luffy', en:'$5,000–$6,000', psa:'$10,000+', jp:'¥700,000 (≈$4,895)', note:'First serialized card ever' },

  // ── P-* Event Packs ─────────────────────────────────────────────────
  'P-028': { releasedIn:'promos', name:'Portgas D. Ace',    en:'$30–$60', psa:'$140', jp:'¥4,500 (≈$31)',    note:'Event Pack Vol.1 — first event pack' },
  'P-032': { releasedIn:'promos', name:'Sengoku',           en:'$8–$15',  psa:'$40',  jp:'¥1,200 (≈$8)',     note:'EP Vol.1 — 5th card (NOT Zoro)' },
  'P-033': { releasedIn:'promos', name:'Monkey D. Luffy',   en:'$180',    psa:'$500', jp:'¥25,000 (≈$175)',  note:'Event Pack Vol.2 silver foil' },
  'P-097': { releasedIn:'promos', name:'Shanks',            en:'$25–$60', psa:'$150', jp:'¥4,000 (≈$28)',    note:'Event Pack Vol.8 (current)' },
  'P-098': { releasedIn:'promos', name:'Buggy',             en:'$20–$40', psa:'$100', jp:'¥3,000 (≈$21)',    note:'Event Pack Vol.8 (current)' },
  'P-099': { releasedIn:'promos', name:'Monkey D. Luffy',   en:'$20–$45', psa:'$110', jp:'¥3,200 (≈$22)',    note:'Event Pack Vol.8 (current)' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

// Parse a price string like "$1,234" or "$10–$50" → numeric for sorting.
// Takes the LARGEST $-figure on the input; returns 0 if unparseable.
window.priceNum = function (s) {
  if (s == null) return 0;
  const matches = String(s).match(/\$\s*[\d,]+/g) || [];
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};

// Return a flat headline view (highest-priced variant) for a card code.
// Used by tournament-guide.html and card-lookup.html to flatten variants.
window.priceHeadline = function (code) {
  const e = window.PRICE_DB[code];
  if (!e) return null;

  // Find variant entries (keys '' or starting with '_' whose value is an object)
  const variants = Object.entries(e).filter(([k, v]) =>
    (k === '' || k.startsWith('_')) && v && typeof v === 'object'
  );

  if (variants.length === 0) {
    // Already flat — return as-is
    return { name: e.name, en: e.en, psa: e.psa, jp: e.jp, note: e.note, releasedIn: e.releasedIn };
  }

  // Highest-priced variant by parsed EN dollars
  const top = variants.reduce((a, b) => window.priceNum(b[1].en) > window.priceNum(a[1].en) ? b : a);

  return {
    name:       e.name || top[1].label,
    en:         top[1].en,
    psa:        top[1].psa,
    jp:         top[1].jp || e.jp,
    note:       top[1].note || e.note || top[1].label,
    suffix:     top[0],
    releasedIn: top[1].releasedIn,
  };
};

// Return every (code, suffix, variant) tuple released in a given set, ready
// to be sorted by price for top-N rendering. Excludes 'promos' implicitly:
// pass setId === 'promos' to get those instead.
//
//   window.cardsForSet('op13')
//     → [{ code:'OP13-118', suffix:'_p3', name:'…', variant:{…}, price:8490 }, …]
window.cardsForSet = function (setId) {
  const out = [];
  for (const [code, entry] of Object.entries(window.PRICE_DB)) {
    if (!entry) continue;

    // Flat entry — entry.releasedIn applies to the whole record
    const isFlat = !Object.keys(entry).some(k => k === '' || k.startsWith('_'));
    if (isFlat) {
      if (entry.releasedIn === setId) {
        out.push({
          code,
          suffix:  '',
          name:    entry.name,
          variant: entry,
          price:   window.priceNum(entry.en),
        });
      }
      continue;
    }

    // Nested — each variant has its own releasedIn
    for (const [suffix, v] of Object.entries(entry)) {
      if (!(suffix === '' || suffix.startsWith('_'))) continue;
      if (!v || typeof v !== 'object') continue;
      if (v.releasedIn !== setId) continue;
      out.push({
        code,
        suffix,
        name:    entry.name,
        variant: v,
        price:   window.priceNum(v.en),
      });
    }
  }
  return out.sort((a, b) => b.price - a.price);
};
