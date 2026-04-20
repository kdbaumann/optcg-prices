/**
 * Netlify Scheduled Function: refresh-prices
 * Runs daily at 6am UTC via cron: "0 6 * * *"
 *
 * Does three things in sequence:
 *   1. PRICE REFRESH — fetches current EN prices for tracked cards → prices.json
 *   2. NEW SET DETECTION — checks OPCardlist for sets not yet in the price guide
 *   3. AUTO TAB GENERATION — for each new set: researches it, generates HTML tab,
 *      patches index.html with the new nav button + section (fully automated)
 *
 * New sets are added to the site within 24 hours of appearing on OPCardlist.
 * No manual intervention required.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { generateSetTab, setCodeToId } from "./generate-set-tab.mjs";
import { patchIndex, loadAutoSetsState, saveAutoSetsState, setAlreadyExists } from "./patch-index.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — PRICE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

// All sets currently tracked in the price guide.
// When a new set tab is auto-generated, its chase cards get appended here
// on the next deploy (via auto-sets-state.json being committed).
const PRICE_TARGETS = [
  // OP-01
  { id: "op01_luffy_leader",  label: "Monkey D. Luffy Leader Parallel",  set: "OP-01", card: "OP01-003 parallel foil leader" },
  { id: "op01_shanks_manga",  label: "Shanks Manga SEC",                 set: "OP-01", card: "OP01-120 manga alternate art" },
  // OP-05
  { id: "op05_luffy_goldsig", label: "Luffy Gold Signature SP",          set: "OP-05", card: "OP05-119 gold stamped signature SP" },
  { id: "op05_law_manga",     label: "Trafalgar Law Manga",              set: "OP-05", card: "OP05-069 manga alternate art" },
  { id: "op05_kid_manga",     label: "Eustass Kid Manga",                set: "OP-05", card: "OP05-074 manga alternate art" },
  // OP-07
  { id: "op07_hancock_manga", label: "Boa Hancock Manga",                set: "OP-07", card: "OP07-051 manga alternate art SEC" },
  // OP-08
  { id: "op08_rayleigh",      label: "Silvers Rayleigh Manga",           set: "OP-08", card: "OP08-118 manga alternate art" },
  // OP-09
  { id: "op09_roger_manga",   label: "Gol D. Roger Gold Manga",          set: "OP-09", card: "OP09-118 gold manga alternate art" },
  { id: "op09_luffy_manga",   label: "Monkey D. Luffy Manga",            set: "OP-09", card: "OP09-119 manga alternate art" },
  { id: "op09_shanks_gold",   label: "Shanks SP Gold",                   set: "OP-09", card: "OP09-004 SP gold parallel" },
  // OP-10
  { id: "op10_law_manga",     label: "Trafalgar Law Manga",              set: "OP-10", card: "OP10-119 manga alternate art" },
  // OP-11
  { id: "op11_luffy_gold",    label: "Luffy 3rd Anniv SP Gold",          set: "OP-11", card: "OP05-119 3rd anniversary SP gold" },
  { id: "op11_luffy_silver",  label: "Luffy 3rd Anniv SP Silver",        set: "OP-11", card: "OP05-119 3rd anniversary SP silver" },
  { id: "op11_luffy_manga",   label: "Luffy Snakeman Manga",             set: "OP-11", card: "OP11-118 manga alternate art" },
  // OP-12
  { id: "op12_teach_silver",  label: "Marshall D. Teach SP Silver",      set: "OP-12", card: "OP09-093 3rd anniversary SP silver" },
  { id: "op12_bonney_manga",  label: "Jewelry Bonney Manga",             set: "OP-12", card: "OP12-118 manga alternate art" },
  // OP-13
  { id: "op13_luffy_redsaa",  label: "Luffy Red Super Alt Art",          set: "OP-13", card: "OP13-118 red super alternate art SEC" },
  { id: "op13_sabo_redsaa",   label: "Sabo Red Super Alt Art",           set: "OP-13", card: "OP13-120 red super alternate art SEC" },
  { id: "op13_ace_redsaa",    label: "Ace Red Super Alt Art",            set: "OP-13", card: "OP13-119 red super alternate art SEC" },
  { id: "op13_shanks_gold",   label: "Shanks SP Gold",                   set: "OP-13", card: "OP09-004 P5 SP gold (in OP-13)" },
  // OP-14
  { id: "op14_buggy_gold",    label: "Buggy SP Gold Anniversary",        set: "OP-14", card: "OP09-051 SP gold anniversary" },
  { id: "op14_mihawk_manga",  label: "Dracule Mihawk Manga",             set: "OP-14", card: "OP14-119 manga alternate art" },
  { id: "op14_buggy_silver",  label: "Buggy SP Silver Anniversary",      set: "OP-14", card: "OP09-051 SP silver anniversary" },
  // OP-15
  { id: "op15_enel_manga",    label: "Enel Manga",                       set: "OP-15", card: "OP15-118 manga alternate art SEC" },
  // EB-01
  { id: "eb01_chopper_manga", label: "Tony Tony Chopper Manga",          set: "EB-01", card: "EB01-006 manga alternate art" },
  // EB-02
  { id: "eb02_luffy_sp",      label: "Luffy SP Leader",                  set: "EB-02", card: "OP05-060 SP leader parallel" },
  { id: "eb02_luffy_manga",   label: "Luffy Manga (Gear 2)",             set: "EB-02", card: "EB02-061 manga alternate art" },
  // EB-03
  { id: "eb03_nami_sp",       label: "Nami SP Manga",                    set: "EB-03", card: "EB03-053 SP manga alternate art" },
  { id: "eb03_uta_manga",     label: "Uta Manga",                        set: "EB-03", card: "EB03-061 manga alternate art" },
  { id: "eb03_robin_sp",      label: "Nico Robin SP Manga",              set: "EB-03", card: "EB03-055 SP manga alternate art" },
  { id: "eb03_hancock_sp",    label: "Boa Hancock SP Manga",             set: "EB-03", card: "EB03-026 SP manga alternate art" },
  // PRB-01
  { id: "prb01_luffy",        label: "Luffy Comic Parallel",             set: "PRB-01", card: "OP05-119 comic parallel" },
  { id: "prb01_chopper",      label: "Chopper Comic Parallel",           set: "PRB-01", card: "EB01-006 comic parallel" },
  { id: "prb01_nami",         label: "Nami Comic Parallel",              set: "PRB-01", card: "OP01-016 comic parallel" },
  // PRB-02
  { id: "prb02_sanji_manga",  label: "Vinsmoke Sanji Manga",             set: "PRB-02", card: "OP06-119 manga alternate art" },
  // ── AUTO-GENERATED ENTRIES APPENDED BELOW ─────────────────────────────────
  // New sets detected and processed by the auto-tab system are logged here.
  // Their price_targets from generate-set-tab.mjs are captured in
  // public/auto-sets-state.json and merged on the next manual deploy.
];

function buildPricePrompt(targets) {
  const list = targets.map((t, i) => `${i+1}. [${t.id}] ${t.label} — ${t.set} · ${t.card}`).join("\n");
  return `You are a One Piece TCG English market price expert. Search opcardlist.com for current raw NM ungraded EN prices.

For each card use MEDIAN or LAST SOLD — not market price (market price is distorted for thin-market cards).

Cards:
${list}

Return ONLY valid JSON:
{
  "fetched_at": "${new Date().toISOString()}",
  "prices": [
    {"id": "op01_luffy_leader", "price": "$1,649", "source": "opcardlist median", "trend": "stable"}
  ]
}

trend: "up" | "down" | "stable" | "new" (new set, still settling)
If unavailable: "price": null, "source": "unavailable"`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — NEW SET DETECTION
// ═══════════════════════════════════════════════════════════════════════════

// ─── Complete Set Registry ──────────────────────────────────────────────────
// Every set currently in the price guide. Used to detect new ones.
// Key = normalized ID (lowercase, no punctuation). Value = metadata.
const KNOWN_SETS = {
  // Main booster sets
  "op01":          { code: "OP-01",    type: "booster",  tabWorthy: true  },
  "op02":          { code: "OP-02",    type: "booster",  tabWorthy: true  },
  "op03":          { code: "OP-03",    type: "booster",  tabWorthy: true  },
  "op04":          { code: "OP-04",    type: "booster",  tabWorthy: true  },
  "op05":          { code: "OP-05",    type: "booster",  tabWorthy: true  },
  "op06":          { code: "OP-06",    type: "booster",  tabWorthy: true  },
  "op07":          { code: "OP-07",    type: "booster",  tabWorthy: true  },
  "op08":          { code: "OP-08",    type: "booster",  tabWorthy: true  },
  "op09":          { code: "OP-09",    type: "booster",  tabWorthy: true  },
  "op10":          { code: "OP-10",    type: "booster",  tabWorthy: true  },
  "op11":          { code: "OP-11",    type: "booster",  tabWorthy: true  },
  "op12":          { code: "OP-12",    type: "booster",  tabWorthy: true  },
  "op13":          { code: "OP-13",    type: "booster",  tabWorthy: true  },
  "op14eb04":      { code: "OP14-EB04",type: "booster",  tabWorthy: true  },
  "op14":          { code: "OP-14",    type: "booster",  tabWorthy: true  },
  "op15":          { code: "OP-15",    type: "booster",  tabWorthy: true  },
  // Extra boosters
  "eb01":          { code: "EB-01",    type: "extra",    tabWorthy: true  },
  "eb02":          { code: "EB-02",    type: "extra",    tabWorthy: true  },
  "eb03":          { code: "EB-03",    type: "extra",    tabWorthy: true  },
  "eb04":          { code: "EB-04",    type: "extra",    tabWorthy: false }, // bundled with OP-14
  // Premium boosters
  "prb01":         { code: "PRB-01",   type: "premium",  tabWorthy: true  },
  "prb02":         { code: "PRB-02",   type: "premium",  tabWorthy: true  },
  // Starter decks (ST-01 through ST-29) — known but not tab-worthy individually
  // They appear as SP source sets in booster packs. Only tabWorthy if high EV.
  "st01":          { code: "ST-01",    type: "starter",  tabWorthy: false },
  "st02":          { code: "ST-02",    type: "starter",  tabWorthy: false },
  "st03":          { code: "ST-03",    type: "starter",  tabWorthy: false },
  "st04":          { code: "ST-04",    type: "starter",  tabWorthy: false },
  "st05":          { code: "ST-05",    type: "starter",  tabWorthy: false },
  "st06":          { code: "ST-06",    type: "starter",  tabWorthy: false },
  "st07":          { code: "ST-07",    type: "starter",  tabWorthy: false },
  "st08":          { code: "ST-08",    type: "starter",  tabWorthy: false },
  "st09":          { code: "ST-09",    type: "starter",  tabWorthy: false },
  "st10":          { code: "ST-10",    type: "ultradeck",tabWorthy: false },
  "st11":          { code: "ST-11",    type: "starter",  tabWorthy: false },
  "st12":          { code: "ST-12",    type: "starter",  tabWorthy: false },
  "st13":          { code: "ST-13",    type: "ultradeck",tabWorthy: false },
  "st14":          { code: "ST-14",    type: "starter",  tabWorthy: false },
  "st15":          { code: "ST-15",    type: "starter",  tabWorthy: false },
  "st16":          { code: "ST-16",    type: "starter",  tabWorthy: false },
  "st17":          { code: "ST-17",    type: "starter",  tabWorthy: false },
  "st18":          { code: "ST-18",    type: "starter",  tabWorthy: false },
  "st19":          { code: "ST-19",    type: "starter",  tabWorthy: false },
  "st20":          { code: "ST-20",    type: "starter",  tabWorthy: false },
  "st21":          { code: "ST-21",    type: "starterex",tabWorthy: false },
  "st22":          { code: "ST-22",    type: "starter",  tabWorthy: false },
  "st23":          { code: "ST-23",    type: "starter",  tabWorthy: false },
  "st24":          { code: "ST-24",    type: "starter",  tabWorthy: false },
  "st25":          { code: "ST-25",    type: "starter",  tabWorthy: false },
  "st26":          { code: "ST-26",    type: "starter",  tabWorthy: false },
  "st27":          { code: "ST-27",    type: "starter",  tabWorthy: false },
  "st28":          { code: "ST-28",    type: "starter",  tabWorthy: false },
  "st29":          { code: "ST-29",    type: "starter",  tabWorthy: false },
  // Other / Promo — tracked but not as individual set tabs
  "otherproduct":  { code: "OTHER",    type: "other",    tabWorthy: false },
  "promo":         { code: "PROMO",    type: "promo",    tabWorthy: false }, // has its own tab
};

// Sets that are tab-worthy by type regardless of explicit tabWorthy flag
// A new booster/extra/premium set is ALWAYS worth a tab.
// A new starter is only worth a tab if it has exclusive high-value cards (we check this).
const TAB_WORTHY_TYPES = new Set(["booster", "extra", "premium"]);

// ─── Set Type Classifier ────────────────────────────────────────────────────
function classifySet(slug, label = "") {
  const id = slug.replace(/[^a-z0-9]/gi, "").toLowerCase();

  if (id.match(/^op\d+eb\d+/))    return { type: "booster",   tabWorthy: true  }; // combined OP+EB
  if (id.match(/^op\d+/))         return { type: "booster",   tabWorthy: true  };
  if (id.match(/^eb\d+/))         return { type: "extra",     tabWorthy: true  };
  if (id.match(/^prb\d+/))        return { type: "premium",   tabWorthy: true  };
  if (id.match(/^st\d+/)) {
    // Ultra Decks and Starter Deck EX occasionally have exclusive high-value SPs
    const isUltra = label.toLowerCase().includes("ultra");
    const isEx    = label.toLowerCase().includes("ex");
    return { type: isUltra ? "ultradeck" : isEx ? "starterex" : "starter", tabWorthy: isUltra || isEx };
  }
  if (id.match(/^ts\d+/))         return { type: "tinset",    tabWorthy: false }; // tin packs
  if (id.match(/^cp\d+/))         return { type: "crossover", tabWorthy: true  }; // crossover packs
  if (id.includes("promo"))       return { type: "promo",     tabWorthy: false };
  if (id.includes("other"))       return { type: "other",     tabWorthy: false };
  return { type: "unknown", tabWorthy: false };
}

// ─── Multi-source Set Detector ──────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; optcg-price-sync/2.0)" },
      timeout: 15000,
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function detectNewSets() {
  const foundSets = new Map(); // slug -> { slug, code, label, type, tabWorthy }

  // ── Source 1: OPCardlist homepage (most reliable for value-tracking) ───────
  try {
    const html = await fetchText("https://www.opcardlist.com");

    // Extract every set href + its label (e.g. "OP-16 - New Set Name")
    const setBlock = /## All Sets([\s\S]*?)Built by/i.exec(html)?.[1] || html;

    // Match: href="/slug" ... ### CODE ... Set Name ... N cards
    const setRegex = /href="\/([\w\-]+)"[^>]*>[\s\S]*?###\s*([\w\-]+)([\s\S]*?)(\d+)\s*cards/gi;
    let m;
    while ((m = setRegex.exec(setBlock)) !== null) {
      const slug  = m[1].toLowerCase().trim();
      const code  = m[2].trim();
      const label = m[3].replace(/<[^>]+>/g, "").trim().split("\n")[0].trim();
      const id    = slug.replace(/[^a-z0-9]/g, "");

      if (!KNOWN_SETS[id] && slug.length > 2) {
        const classified = classifySet(slug, label);
        foundSets.set(slug, { slug, code, label: label || code, ...classified });
      }
    }

    // Also catch simple href patterns for sets not yet in "All Sets" section
    const hrefRegex = /href="\/((?:op|eb|prb|st|ts|cp)[a-z0-9\-]+)"/gi;
    while ((m = hrefRegex.exec(html)) !== null) {
      const slug = m[1].toLowerCase();
      const id   = slug.replace(/[^a-z0-9]/g, "");
      if (!KNOWN_SETS[id] && !foundSets.has(slug)) {
        const classified = classifySet(slug);
        const code = slug.toUpperCase().replace(/(\D+)(\d+)/, "$1-$2");
        foundSets.set(slug, { slug, code, label: code, ...classified });
      }
    }

    console.log(`[detectNewSets] OPCardlist: ${foundSets.size} potential new sets`);
  } catch (err) {
    console.warn(`[detectNewSets] OPCardlist fetch failed: ${err.message}`);
  }

  // ── Source 2: Bandai official card list (catches ALL set types) ────────────
  try {
    const html = await fetchText("https://en.onepiece-cardgame.com/cardlist/");

    // Extract set codes from the dropdown: e.g. [OP-16], [EB-05], [ST-30], [PRB-03]
    const setCodeRegex = /\[((?:OP|EB|PRB|ST|TS|CP)[\w\-]+)\]/g;
    let m;
    while ((m = setCodeRegex.exec(html)) !== null) {
      const code = m[1].trim();
      const id   = code.replace(/[^a-z0-9]/gi, "").toLowerCase();

      if (!KNOWN_SETS[id]) {
        const slug       = code.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        const classified = classifySet(slug, code);

        // Extract label from surrounding text
        const labelMatch = html.slice(Math.max(0, m.index - 200), m.index)
          .match(/([A-Z][A-Z\s\-\'\.]+)\s*\[/);
        const label = labelMatch ? labelMatch[1].trim() : code;

        if (!foundSets.has(slug)) {
          foundSets.set(slug, { slug, code, label, ...classified });
        }
      }
    }

    console.log(`[detectNewSets] Bandai official: checked ${foundSets.size} total new sets`);
  } catch (err) {
    console.warn(`[detectNewSets] Bandai fetch failed: ${err.message}`);
  }

  // ── Source 3: Limitless TCG (catches competitive releases quickly) ──────────
  try {
    const html = await fetchText("https://onepiece.limitlesstcg.com/cards");

    const setRegex = /\bOP-(\d+)\b|\bEB-(\d+)\b|\bPRB-(\d+)\b|\bST-(\d+)\b/g;
    let m;
    while ((m = setRegex.exec(html)) !== null) {
      const n    = m[1] || m[2] || m[3] || m[4];
      const pref = m[1] ? "OP" : m[2] ? "EB" : m[3] ? "PRB" : "ST";
      const code = `${pref}-${n}`;
      const id   = code.replace(/[^a-z0-9]/gi, "").toLowerCase();
      const slug = code.toLowerCase().replace("-", "-");

      if (!KNOWN_SETS[id] && !foundSets.has(slug)) {
        const classified = classifySet(slug, code);
        foundSets.set(slug, { slug, code, label: code, ...classified });
      }
    }

    console.log(`[detectNewSets] Limitless TCG checked`);
  } catch (err) {
    console.warn(`[detectNewSets] Limitless fetch failed: ${err.message}`);
  }

  return [...foundSets.values()];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler() {
  const startTime = Date.now();
  console.log(`[refresh-prices] ═══ Starting at ${new Date().toISOString()} ═══`);

  const results = {
    prices:    { ok: false, count: 0 },
    new_sets:  { found: [], processed: [], failed: [] },
  };

  // ── STEP 1: Refresh prices ───────────────────────────────────────────────
  console.log("[refresh-prices] Step 1: Refreshing prices...");
  try {
    const priceResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: buildPricePrompt(PRICE_TARGETS) }],
    });

    const text  = priceResponse.content.filter(b => b.type === "text").map(b => b.text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");

    if (s === -1 || e === -1) throw new Error("No JSON in price response");

    const priceData = JSON.parse(clean.slice(s, e + 1));
    if (!priceData.prices?.length) throw new Error("Empty price array");

    priceData.generated_at = new Date().toISOString();
    priceData.card_count   = priceData.prices.length;
    priceData.success      = true;

    fs.writeFileSync(
      path.join(process.cwd(), "public", "prices.json"),
      JSON.stringify(priceData, null, 2)
    );

    results.prices = { ok: true, count: priceData.prices.length };
    console.log(`[refresh-prices] ✅ Prices: ${priceData.prices.length} cards updated`);
  } catch (err) {
    console.error(`[refresh-prices] ❌ Price refresh failed: ${err.message}`);
    results.prices = { ok: false, error: err.message };
  }

  // ── STEP 2: Detect new sets ──────────────────────────────────────────────
  console.log("[refresh-prices] Step 2: Checking for new sets...");
  const autoState = loadAutoSetsState();

  let newSets = [];
  try {
    const detected = await detectNewSets();

    // Filter out sets we've already processed or failed on recently
    const recentlyFailed = new Set(
      (autoState.failed_sets || [])
        .filter(f => Date.now() - new Date(f.failed_at).getTime() < 7 * 86400000)
        .map(f => f.slug)
    );

    newSets = detected.filter(s => {
      const id = s.slug.replace(/[^a-z0-9]/g, "");
      return (
        !autoState.processed_sets?.includes(s.slug) &&
        !recentlyFailed.has(s.slug) &&
        !setAlreadyExists(setCodeToId(s.code)) &&
        // Only auto-generate tabs for tab-worthy set types
        // For starters/promos/other we log but don't generate a tab
        (TAB_WORTHY_TYPES.has(s.type) || s.tabWorthy)
      );
    });

    // Log non-tab-worthy detections separately (informational only)
    const nonTabWorthy = detected.filter(s =>
      !TAB_WORTHY_TYPES.has(s.type) && !s.tabWorthy &&
      !autoState.processed_sets?.includes(s.slug)
    );
    if (nonTabWorthy.length > 0) {
      console.log(`[refresh-prices] ℹ New non-tab sets detected (starters/promos — no tab generated): ${nonTabWorthy.map(s => s.code).join(", ")}`);
      // Still record them so we don't re-detect every day
      nonTabWorthy.forEach(s => {
        autoState.processed_sets = autoState.processed_sets || [];
        if (!autoState.processed_sets.includes(s.slug)) {
          autoState.processed_sets.push(s.slug);
        }
      });
    }

    if (newSets.length > 0) {
      console.log(`[refresh-prices] 🆕 New tab-worthy sets: ${newSets.map(s => `${s.code} (${s.type})`).join(", ")}`);
      results.new_sets.found = newSets.map(s => s.code);
    } else {
      console.log("[refresh-prices] ✓ No new tab-worthy sets found");
    }
  } catch (err) {
    console.warn(`[refresh-prices] ⚠ Set detection failed: ${err.message}`);
  }

  // ── STEP 3: Generate tabs for new sets ──────────────────────────────────
  if (newSets.length > 0) {
    console.log(`[refresh-prices] Step 3: Auto-generating tabs for ${newSets.length} new set(s)...`);

    for (const { slug, code, type } of newSets) {
      console.log(`[refresh-prices] Processing ${code}...`);
      try {
        // Research the set and generate tab HTML
        const tabResult = await generateSetTab(code, type);

        // Patch index.html with the new tab
        const patched = patchIndex(tabResult);

        if (patched) {
          // Record success
          autoState.processed_sets = autoState.processed_sets || [];
          autoState.processed_sets.push(slug);
          autoState.last_added_set = {
            slug,
            code,
            name: tabResult.data?.name,
            added_at: new Date().toISOString(),
            price_targets: tabResult.priceTargets,
          };
          results.new_sets.processed.push(code);
          console.log(`[refresh-prices] ✅ ${code} tab added to index.html`);
        } else {
          throw new Error("patchIndex returned false");
        }
      } catch (err) {
        console.error(`[refresh-prices] ❌ Failed to generate tab for ${code}: ${err.message}`);
        autoState.failed_sets = autoState.failed_sets || [];
        autoState.failed_sets.push({ slug, code, error: err.message, failed_at: new Date().toISOString() });
        results.new_sets.failed.push(code);
      }
    }

    saveAutoSetsState(autoState);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[refresh-prices] ═══ Complete in ${elapsed}s ═══`);
  console.log(`[refresh-prices] Prices: ${results.prices.ok ? "✅" : "❌"} | New sets: ${results.new_sets.processed.length} added, ${results.new_sets.failed.length} failed`);

  const status = results.prices.ok ? 200 : 500;
  return new Response(JSON.stringify(results, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  schedule: "0 6 * * *",
};
