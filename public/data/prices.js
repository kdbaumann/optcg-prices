// public/data/prices.js
// CANONICAL PRICE DATA — single source of truth for the entire site.
//
// Shape per entry:
//   'CARD-CODE': { name, en, psa, jp, note }                           ← single-variant (flat)
// OR:
//   'CARD-CODE': { name?, '': {en,label}, '_p1': {...}, '_p2': {...} } ← multi-variant (nested)
//
// Suffixes: '' = base · '_p1' parallel · '_p2' manga alt · '_p3' Red SAA
//           '_p4' tournament stamp · '_p5'/'_p6'/'_p7' SP variants · '_r1'/'_r2' reprints
//
// Loaded by: index.html, tournament-guide.html, card-lookup.html
// Each page derives its own view via priceHeadline() (defined below).

window.PRICE_DB = {
    'OP01-120': {
    name: 'Shanks',
    '': { en:'$8',  label:'Base Shanks MR' },
    '_p1': { en:'$107', psa:'$320', label:'SR Parallel' },
    '_p2': { en:'$776', psa:'$2,200', label:'Manga Alt Art (SEC★)' },
  },
  'OP01-003': { name:'Monkey D. Luffy', en:'$833', psa:'$2,800', jp:'¥120k (≈$839)', note:'Leader Parallel (_p1) · Feb 2026 OPCardlist' },
  'OP01-016': { name:'Nami', en:'$454', psa:'$1,400', jp:'¥65k (≈$455)', note:'SR Parallel (_p1) · strong demand' },
  'OP02-099': { name:'Sakazuki',        en:'$1,300',    psa:'$3,500',   jp:'¥150,000 (≈$1,050)','note':'Championship 2023 stamp' },
  'OP02-096': { name:'Kuzan',           en:'$1,000',    psa:'$5,450',   jp:'¥120,000 (≈$840)', note:'Championship 2023 stamp' },
  'OP03-122': { name:'Sogeking', en:'$426', psa:'$1,278', jp:'¥62k (≈$433)', note:'Comic Parallel PRB-01 (_r1)' },
  'OP04-083': { name:'Sabo', en:'$399', psa:'$1,197', jp:'¥58k (≈$406)', note:'Comic Parallel PRB-01 (_r1)' },
    'OP05-119': {
    name: 'Monkey D. Luffy',
    '': { en:'$14',  label:'Base Gear 5 Luffy' },
    '_p1': { en:'$190', psa:'$570', label:'SR Parallel Foil' },
    '_p2': { en:'$190', psa:'$570', label:'Manga Alt (SEC parallel)' },
    '_p4': { en:'$256', psa:'$768', label:'TC Promo Stamp' },
    '_p7': { en:'$3,761', psa:'$11,283', label:'3rd Anniversary SP Gold (in OP05 via PRB?)' },
    '_p8': { en:'$2,133', psa:'$6,399', label:'3rd Anniversary SP Silver' },
    '_r2': { en:'$2,682', psa:'$8,046', label:'PRB-01 Comic Parallel Reprint' },
  },
  'OP06-118': { name:'Roronoa Zoro', en:'$1,928', psa:'$6,750', jp:'¥280k (≈$1,958)', note:'Manga Alt (_p2) · OPCardlist Feb 2026' },
  'OP07-051': { name:'Boa Hancock', en:'$710', psa:'$2,100', jp:'¥105k (≈$734)', note:'SP variant (_p3) · Manga Alt (_p2) = $2,192' },
  'OP08-118': { name:'Silvers Rayleigh',en:'$500',      psa:'$1,600',   jp:'¥80,000 (≈$560)',  note:'OP-08 SEC★ Manga Rare' },
  'OP09-118': { name:'Gol D. Roger', en:'$3,574', psa:'$10,000', jp:'¥520k (≈$3,636)', note:'Gold Manga Rare (_p2) · Feb 2026 OPCardlist' },
  'OP09-119': { name:'Monkey D. Luffy', en:'$2,950',    psa:'$8,500',   jp:'¥190,000 (≈$1,329)','note':'OP-09 Gold Emperor SEC' },
    'OP09-051': {
    name: 'Buggy',
    '': { en:'$35',  label:'Base Buggy' },
    '_p1': { en:'$36',  label:'Parallel Foil' },
    '_p2': { en:'$939', psa:'$2,800', label:'SP Gold (2nd Anniversary)' },
    '_p4': { en:'$2,649', psa:'$7,947', label:'SP Gold (3rd Anniversary — OP-14)' },
    '_p5': { en:'$1,328', psa:'$3,984', label:'SP Silver (3rd Anniversary — OP-14)' },
  },
    'OP09-093': {
    name: 'Marshall D. Teach',
    '': { en:'$34',  label:'Base Blackbeard' },
    '_p1': { en:'$34',  label:'Parallel Foil' },
    '_p2': { en:'$944', psa:'$2,832', label:'SP Gold (2nd Anniversary)' },
    '_p3': { en:'$181', psa:'$543', label:'SP Silver (3rd Anniversary — OP-12)' },
    '_p4': { en:'$572', psa:'$1,716', label:'SP Gold (3rd Anniversary — OP-12)' },
  },
    'OP09-004': {
    name: 'Shanks',
    '': { en:'$22',  label:'Base Leader' },
    '_p1': { en:'$22',  label:'Leader Parallel' },
    '_p2': { en:'$1,203', psa:'$3,600', label:'SP Gold (2nd Anniversary)' },
    '_p3': { en:'$301', psa:'$900', label:'SP Silver (2nd Anniversary)' },
    '_p5': { en:'$1,545', psa:'$4,635', label:'SP Gold (3rd Anniversary — OP-13)' },
    '_p6': { en:'$982', psa:'$2,946', label:'SP Silver (3rd Anniversary — OP-13)' },
  },
  'OP10-119': { name:'Trafalgar Law',   en:'$500',      psa:'$1,800',   jp:'¥90,000 (≈$629)',  note:'OP-10 SEC★ Manga Rare' },
  'OP11-118': { name:'Monkey D. Luffy', en:'$310',      psa:'$900',     jp:'¥40,000 (≈$280)',  note:'OP-11 SEC★ Manga Rare' },
  'OP12-118': { name:'Jewelry Bonney',  en:'$800',      psa:'$2,500',   jp:'¥60,000 (≈$420)',  note:'OP-12 SEC★ Manga Rare' },
  'OP12-020': { name:'Roronoa Zoro',    en:'$1,500–$3,000', psa:'$6,000', jp:'¥200,000 (≈$1,399)','note':'Serial # card — TC Top 4 prize' },
    'OP13-118': {
    name: 'Monkey D. Luffy (Red SAA)',
    '': { en:'$76', psa:'$228', label:'Base Parallel Leader' },
    '_p2': { en:'$1,949', psa:'$5,847', label:'Manga Alt Art' },
    '_p3': { en:'$8,490', psa:'$24,100', label:'Red Super Alt Art (SEC★)' },
    '_p4': { en:'$476', psa:'$1,428', label:'TC Promo Top 16' },
  },
  'OP13-119': { name:'Portgas D. Ace', en:'$4,420', psa:'$12,000', jp:'¥640k (≈$4,476)', note:'Red SAA (_p3) · Manga Alt (_p2) = $1,198' },
  'OP13-120': { name:'Sabo', en:'$4,750', psa:'$14,000', jp:'¥690k (≈$4,825)', note:'Red SAA (_p3) · Manga Alt (_p2) = $847' },
    'OP14-119': {
    name: 'Dracule Mihawk',
    '': { en:'$46', psa:'$138', label:'Base Mihawk' },
    '_p2': { en:'$1,400', psa:'$4,200', label:'Manga Alt Art (SEC★)' },
  },
    'EB01-006': {
    name: 'Tony Tony Chopper',
    '': { en:'$23', psa:'$68', label:'Base Chopper MR' },
    '_p1': { en:'$67', psa:'$201', label:'SR Parallel Foil' },
    '_p2': { en:'$1,973', psa:'$6,000', label:'SEC★ Manga Art' },
    '_r1': { en:'$1,484', psa:'$4,452', label:'PRB-01 Comic Parallel Reprint' },
  },
  'EB02-061': { name:'Monkey D. Luffy', en:'$3,000',   psa:'$10,000',  jp:'¥85,000 (≈$594)',  note:'EB-02 SP Leader — Gear 2 anniversary' },
    'EB03-053': {
    name: 'Nami',
    '': { en:'$38', psa:'$114', label:'Base Nami' },
    '_p1': { en:'$136', psa:'$408', label:'SR Parallel Foil' },
    '_p2': { en:'$1,725', psa:'$5,175', label:'SEC★ Manga Art' },
  },
  'EB03-061': { name:'Uta', en:'$1,536', psa:'$4,608', jp:'¥222k (≈$1,553)', note:'SEC★ Manga Art (_p2)' },
  'ST01-013': { name:'Roronoa Zoro',    en:'$3,000–$5,800', psa:'$21,600', jp:'¥400,000 (≈$2,797)','note':'Treasure Cup Top 8 stamp — record PSA 10' },
  'ST01-001': { name:'Monkey D. Luffy', en:'$5,000–$6,000', psa:'$10,000+', jp:'¥700,000 (≈$4,895)','note':'First serialized card ever' },
  'P-028': { name:'Portgas D. Ace',    en:'$30–$60',   psa:'$140',     jp:'¥4,500 (≈$31)',    note:'Event Pack Vol.1 — first event pack' },
  'P-032': { name:'Sengoku',           en:'$8–$15',    psa:'$40',      jp:'¥1,200 (≈$8)',     note:'EP Vol.1 — 5th card (NOT Zoro)' },
  'P-033': { name:'Monkey D. Luffy',   en:'$180',      psa:'$500',     jp:'¥25,000 (≈$175)',  note:'Event Pack Vol.2 silver foil' },
  'P-097': { name:'Shanks',            en:'$25–$60',   psa:'$150',     jp:'¥4,000 (≈$28)',    note:'Event Pack Vol.8 (current)' },
  'P-098': { name:'Buggy',             en:'$20–$40',   psa:'$100',     jp:'¥3,000 (≈$21)',    note:'Event Pack Vol.8 (current)' },
  'P-099': { name:'Monkey D. Luffy',   en:'$20–$45',   psa:'$110',     jp:'¥3,200 (≈$22)',    note:'Event Pack Vol.8 (current)' },

  'EB04-001': { name:'Nami',         en:'$800',    psa:'$2,800',  jp:'¥120,000 (≈$839)', note:'SP Gold Leader — Heroines New World' },
  'EB04-059': { name:'Monkey D. Luffy', en:'$400', psa:'$1,200',  jp:'¥60,000 (≈$420)',  note:'Manga Alt Art — EB-04' },
  'EB04-060': { name:'Nico Robin',   en:'$500',    psa:'$1,500',  jp:'¥70,000 (≈$490)',  note:'SEC★ Manga Rare — Heroines New World' },
  'EB04-061': { name:'Nami',         en:'$600',    psa:'$1,800',  jp:'¥90,000 (≈$629)',  note:'SEC★ Manga Rare — Heroines New World (top chase)' },
  'EB04-062': { name:'Boa Hancock',  en:'$450',    psa:'$1,350',  jp:'¥65,000 (≈$455)',  note:'SEC★ Manga Rare — Heroines New World' },
  'EB04-044': { name:'Koby',         en:'$800',    psa:'$2,500',  jp:'¥120,000 (≈$839)', note:'SEC★ Manga Rare — EB-04 chase card' },
  'EB03-055': { name:'Nico Robin', en:'$650', psa:'$2,000', jp:'¥120,000 (≈$839)', note:'Heroines SEC — added from card-lookup data' },
  'OP02-097': { name:'Kizaru', en:'$500', psa:'$1,500', jp:'¥80,000 (≈$559)', note:'Championship 2023 promo — added from card-lookup data' },
};

// ── Helper: get a flat headline view of a card (highest-priced variant) ───
// Used by tournament-guide.html and card-lookup.html to flatten variants.
window.priceHeadline = function(code) {
  const e = window.PRICE_DB[code];
  if (!e) return null;

  // Find variant entries (keys starting with '' or '_pX' or '_rX' whose value is an object)
  const variants = Object.entries(e).filter(([k, v]) =>
    (k === '' || k.startsWith('_')) && v && typeof v === 'object'
  );

  if (variants.length === 0) {
    // Already flat — return as-is
    return { name: e.name, en: e.en, psa: e.psa, jp: e.jp, note: e.note };
  }

  // Pick highest-priced variant by parsing the EN price
  const dollars = (s) => {
    const m = String(s || '').match(/\$([\d,]+)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
  };
  const top = variants.reduce((a, b) => dollars(b[1].en) > dollars(a[1].en) ? b : a);

  return {
    name: e.name || top[1].label,
    en: top[1].en,
    psa: top[1].psa,
    jp: top[1].jp || e.jp,
    note: top[1].note || e.note || top[1].label,
    suffix: top[0],
  };
};
