/**
 * download-all-images.mjs
 *
 * Smart One Piece TCG image downloader with caching and new-set detection.
 *
 * BEHAVIOR:
 *   - Images already downloaded are SKIPPED unless they are older than 7 days
 *     (Bandai rarely changes card art, so weekly is more than enough)
 *   - On each run, OPCardlist is checked for new sets not yet in our state file
 *   - New sets are ALWAYS downloaded immediately regardless of age
 *   - A state file (image-state.json) tracks when each set was last fully synced
 *
 * USAGE:
 *   node scripts/download-all-images.mjs                    # normal run (smart cache)
 *   node scripts/download-all-images.mjs --refresh          # force re-download everything
 *   node scripts/download-all-images.mjs --sets=op-16,eb-04 # specific sets only
 *   node scripts/download-all-images.mjs --check-new        # only look for new sets, skip existing
 *   node scripts/download-all-images.mjs --max-age=3        # treat images older than 3 days as stale
 *
 * STATE FILE: public/images/cards/image-state.json
 *   Tracks per-set last-synced timestamps so we know which sets are fresh
 *   and which need updating (e.g. because new cards were added mid-set).
 *
 * NEW SET DETECTION:
 *   On every run, the script fetches the OPCardlist homepage and compares
 *   the live set list against ALL_SETS below. Any set found on OPCardlist
 *   that isn't in ALL_SETS is flagged as NEW and downloaded immediately.
 *   You still need to add new sets to ALL_SETS manually so they persist
 *   across runs — the script will remind you with clear console output.
 *
 * OUTPUT:
 *   public/images/cards/[CODE].png      — one file per card image
 *   public/images/cards/manifest.json   — index of all available images
 *   public/images/cards/image-state.json — per-set sync timestamps
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR  = path.join(__dirname, "..", "public", "images", "cards");
const STATE_FILE  = path.join(OUTPUT_DIR, "image-state.json");
const BANDAI_CDN  = "https://en.onepiece-cardgame.com/images/cardlist/card";
const OPCARDLIST  = "https://www.opcardlist.com";
const DELAY_MS    = 200;    // ms between image downloads (polite to Bandai CDN)
const PAGE_DELAY  = 1500;   // ms between OPCardlist page fetches

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── CLI Arguments ─────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const FORCE_REFRESH = args.includes("--refresh");
const CHECK_NEW     = args.includes("--check-new");
const SET_FILTER    = args.find(a => a.startsWith("--sets="))?.split("=")[1]?.split(",") ?? null;
const maxAgeArg     = args.find(a => a.startsWith("--max-age="));
const MAX_AGE_DAYS  = maxAgeArg ? parseInt(maxAgeArg.split("=")[1]) : 7;
const MAX_AGE_MS    = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// ─── Known Sets ────────────────────────────────────────────────────────────
// ADD NEW SETS HERE as they release.
// slug must match the OPCardlist URL: opcardlist.com/[slug]
// The script will also auto-detect unknown sets from the OPCardlist homepage.
const ALL_SETS = [
  // ── Main Booster Sets ──────────────────────────────────────────
  { slug: "op-01",        name: "OP-01 Romance Dawn",                released: "2022-12-02", cards: 154  },
  { slug: "op-02",        name: "OP-02 Paramount War",               released: "2023-03-10", cards: 154  },
  { slug: "op-03",        name: "OP-03 Pillars of Strength",         released: "2023-06-30", cards: 154  },
  { slug: "op-04",        name: "OP-04 Kingdoms of Intrigue",        released: "2023-09-22", cards: 149  },
  { slug: "op-05",        name: "OP-05 Awakening of the New Era",    released: "2023-12-08", cards: 154  },
  { slug: "op-06",        name: "OP-06 Wings of the Captain",        released: "2024-03-22", cards: 151  },
  { slug: "op-07",        name: "OP-07 500 Years in the Future",     released: "2024-06-28", cards: 151  },
  { slug: "op-08",        name: "OP-08 Two Legends",                 released: "2024-09-27", cards: 151  },
  { slug: "op-09",        name: "OP-09 Emperors in the New World",   released: "2024-12-06", cards: 159  },
  { slug: "op-10",        name: "OP-10 Royal Blood",                 released: "2025-03-28", cards: 151  },
  { slug: "op-11",        name: "OP-11 A Fist of Divine Speed",      released: "2025-06-27", cards: 156  },
  { slug: "op-12",        name: "OP-12 Legacy of the Master",        released: "2025-08-22", cards: 155  },
  { slug: "op-13",        name: "OP-13 Carrying On His Will",        released: "2025-11-07", cards: 175  },
  { slug: "op14-eb04",    name: "OP-14/EB-04 The Azure Sea's Seven", released: "2026-01-31", cards: 199  },
  { slug: "op-15",        name: "OP-15 Adventure on KAMI's Island",  released: "2026-04-03", cards: 195  },
  // ── ADD OP-16 HERE when it releases ──────────────────────────
  // { slug: "op-16",     name: "OP-16 [SET NAME]",                  released: "2026-XX-XX", cards: 0   },

  // ── Extra Boosters ─────────────────────────────────────────────
  { slug: "eb-01",        name: "EB-01 Memorial Collection",         released: "2023-09-22", cards: 80   },
  { slug: "eb-02",        name: "EB-02 Anime 25th Collection",       released: "2024-09-27", cards: 105  },
  { slug: "eb-03",        name: "EB-03 Heroines Edition",            released: "2026-02-28", cards: 90   },
  // ── ADD EB-05 HERE when it releases ──────────────────────────
  // { slug: "eb-05",     name: "EB-05 [SET NAME]",                  released: "2026-XX-XX", cards: 0   },

  // ── Premium Boosters ───────────────────────────────────────────
  { slug: "prb-01",       name: "PRB-01 Card The Best",              released: "2024-07-27", cards: 319  },
  { slug: "prb-02",       name: "PRB-02 Card The Best Vol.2",        released: "2025-10-03", cards: 0    },
  // ── ADD PRB-03 HERE when it releases ─────────────────────────
  // { slug: "prb-03",    name: "PRB-03 [SET NAME]",                  released: "2026-XX-XX", cards: 0   },

  // ── Other / Promo ──────────────────────────────────────────────
  { slug: "other-product", name: "Other Product Cards",              released: "2022-12-02", cards: 57   },
  { slug: "promo",         name: "Promotion Cards",                  released: "2022-12-02", cards: 336  },
];

const KNOWN_SLUGS = new Set(ALL_SETS.map(s => s.slug));

// ─── State File ────────────────────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch {}
  return { sets: {}, last_new_set_check: null, version: "1.0" };
}

function saveState(state) {
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Age Check ─────────────────────────────────────────────────────────────
function isStale(isoTimestamp) {
  if (!isoTimestamp) return true;
  return Date.now() - new Date(isoTimestamp).getTime() > MAX_AGE_MS;
}

function ageLabel(isoTimestamp) {
  if (!isoTimestamp) return "never synced";
  const days = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 86400000);
  if (days === 0) return "synced today";
  if (days === 1) return "synced yesterday";
  return `synced ${days} days ago`;
}

// ─── HTTP Utilities ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchText(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; optcg-image-sync/2.0)",
          "Accept": "text/html,*/*",
        },
        timeout: 20000,
      }, res => {
        if ([301,302,307,308].includes(res.statusCode)) {
          res.resume();
          fetchText(res.headers.location, retries).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          if (n > 0) { sleep(2000).then(() => attempt(n - 1)); return; }
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve(body));
      });
      req.on("error", e => { if (n > 0) sleep(2000).then(() => attempt(n-1)); else reject(e); });
      req.on("timeout", () => { req.destroy(); if (n > 0) sleep(2000).then(() => attempt(n-1)); else reject(new Error("Timeout")); });
    };
    attempt(retries);
  });
}

function downloadImage(url, destPath, forceRefresh = false) {
  return new Promise(resolve => {
    if (!forceRefresh && fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 1000) {
        resolve({ ok: true, cached: true });
        return;
      }
      fs.unlinkSync(destPath);
    }

    const file = fs.createWriteStream(destPath);
    let done = false;

    const fail = reason => {
      if (done) return; done = true;
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      resolve({ ok: false, reason: String(reason).slice(0, 30) });
    };

    const request = (targetUrl, hops = 0) => {
      if (hops > 5) { fail("too many redirects"); return; }
      const lib = targetUrl.startsWith("https") ? https : http;
      const req = lib.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; optcg-image-sync/2.0)",
          "Accept": "image/png,image/*,*/*",
          "Referer": "",  // Strip referrer — bypasses Bandai hotlink block
        },
        timeout: 15000,
      }, res => {
        if ([301,302,307,308].includes(res.statusCode)) {
          res.resume(); request(res.headers.location, hops + 1); return;
        }
        if (res.statusCode !== 200) { res.resume(); fail(`HTTP ${res.statusCode}`); return; }
        res.pipe(file);
        file.on("finish", () => {
          if (done) return; done = true;
          file.close(() => {
            const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
            if (size < 500) { try { fs.unlinkSync(destPath); } catch {} fail("too small"); }
            else resolve({ ok: true, cached: false, bytes: size });
          });
        });
      });
      req.on("error", e => fail(e.code || e.message));
      req.on("timeout", () => { req.destroy(); fail("timeout"); });
    };

    request(url);
  });
}

// ─── Parser ────────────────────────────────────────────────────────────────
function extractImageCodes(html) {
  const codes = new Set();
  const imgRegex = /\/images\/cardlist\/card\/([A-Z0-9\-]+(?:_[a-z][0-9]+)?)\.png/g;
  let m;
  while ((m = imgRegex.exec(html)) !== null) codes.add(m[1]);
  return [...codes];
}

function extractSetSlugs(html) {
  // Parse set slugs from OPCardlist homepage links like /op-01, /op-16, /eb-05 etc.
  const slugs = new Set();
  const linkRegex = /href="\/([a-z][a-z0-9\-]+)"[^>]*>\s*(?:<[^>]+>\s*)*(?:OP-\d+|EB-\d+|PRB-\d+|ST-\d+)/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (slug.match(/^(op|eb|prb|st)\d/)) slugs.add(slug);
  }
  // Also catch from card count pattern: /op-16\n... cards
  const setCardRegex = /href="\/((?:op|eb|prb)[a-z0-9\-]+)"/gi;
  while ((m = setCardRegex.exec(html)) !== null) slugs.add(m[1].toLowerCase());
  return [...slugs];
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const state = loadState();
  const now   = new Date().toISOString();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  One Piece TCG — Smart Image Sync");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Output    : ${OUTPUT_DIR}`);
  console.log(`  Max age   : ${MAX_AGE_DAYS} day(s) — images older than this are re-synced`);
  console.log(`  Mode      : ${FORCE_REFRESH ? "FORCE REFRESH (re-downloading everything)" : CHECK_NEW ? "CHECK NEW SETS ONLY" : "SMART CACHE"}`);
  if (SET_FILTER) console.log(`  Set filter: ${SET_FILTER.join(", ")}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── STEP 1: Check OPCardlist for new sets ────────────────────────────────
  console.log("STEP 1: Checking OPCardlist for new sets...\n");

  let newSetsFound = [];
  try {
    const homeHtml = await fetchText(OPCARDLIST);
    const liveSlugs = extractSetSlugs(homeHtml);
    const unknownSlugs = liveSlugs.filter(s => !KNOWN_SLUGS.has(s));

    if (unknownSlugs.length > 0) {
      console.log(`  🆕 NEW SETS DETECTED on OPCardlist (not in ALL_SETS):`);
      unknownSlugs.forEach(s => {
        console.log(`     → ${s}  (add to ALL_SETS in download-all-images.mjs)`);
        newSetsFound.push(s);
      });
      console.log();
    } else {
      console.log("  ✓ No new sets found — ALL_SETS is up to date\n");
    }

    state.last_new_set_check = now;
    state.detected_new_sets  = newSetsFound;
  } catch (err) {
    console.log(`  ⚠ Could not reach OPCardlist for set check: ${err.message}\n`);
  }

  // ── STEP 2: Determine which sets to sync ────────────────────────────────
  let setsToSync = [];

  if (SET_FILTER) {
    // Explicit filter — sync only these sets
    setsToSync = ALL_SETS.filter(s =>
      SET_FILTER.some(f => s.slug.includes(f) || f.includes(s.slug.replace(/-/g, "")))
    );
    // Also include any new detected sets that match the filter
    newSetsFound
      .filter(slug => SET_FILTER.some(f => slug.includes(f)))
      .forEach(slug => { if (!setsToSync.find(s => s.slug === slug)) setsToSync.push({ slug, name: slug, released: "unknown", cards: 0 }); });

  } else if (CHECK_NEW) {
    // Only process newly detected sets
    setsToSync = newSetsFound.map(slug => ({ slug, name: slug, released: "unknown", cards: 0 }));
    if (setsToSync.length === 0) {
      console.log("STEP 2: No new sets to sync. Done.\n");
      saveState(state);
      return;
    }

  } else {
    // Smart mode: sync sets that are stale OR new OR force-refreshed
    for (const set of ALL_SETS) {
      const lastSync = state.sets[set.slug]?.last_synced;
      const stale    = FORCE_REFRESH || isStale(lastSync);
      const isNew    = !state.sets[set.slug];
      const label    = isNew ? "NEW" : stale ? ageLabel(lastSync) : ageLabel(lastSync);
      const willSync = stale || isNew;

      console.log(`  ${willSync ? "🔄" : "✓ skip"} ${set.slug.padEnd(16)} ${label}`);
      if (willSync) setsToSync.push(set);
    }

    // Always add newly detected sets even if not in ALL_SETS
    for (const slug of newSetsFound) {
      if (!setsToSync.find(s => s.slug === slug)) {
        setsToSync.push({ slug, name: `NEW: ${slug}`, released: "unknown", cards: 0 });
        console.log(`  🆕 adding  ${slug.padEnd(16)} newly detected`);
      }
    }

    const skipCount = ALL_SETS.length - (setsToSync.length - newSetsFound.length);
    console.log(`\n  ${setsToSync.length} sets to sync, ${skipCount} skipped (fresh cache)\n`);

    if (setsToSync.length === 0) {
      console.log("All sets are fresh. Nothing to do.");
      console.log(`Next sync needed in ~${MAX_AGE_DAYS} days. Use --refresh to force.\n`);
      saveState(state);
      return;
    }
  }

  // ── STEP 3: Scrape image codes from set pages ────────────────────────────
  console.log("\nSTEP 3: Scraping set pages for image codes...\n");

  const allCodes = new Set();

  for (const set of setsToSync) {
    const url = `${OPCARDLIST}/${set.slug}`;
    process.stdout.write(`  Fetching ${(set.name || set.slug).padEnd(44)} `);
    try {
      const html  = await fetchText(url);
      const codes = extractImageCodes(html);
      codes.forEach(c => allCodes.add(c));
      process.stdout.write(`→ ${String(codes.length).padStart(3)} images\n`);
    } catch (err) {
      process.stdout.write(`→ FAILED: ${err.message}\n`);
    }
    await sleep(PAGE_DELAY);
  }

  const uniqueCodes = [...allCodes].sort();
  console.log(`\n  Total unique image codes to process: ${uniqueCodes.length}\n`);

  // ── STEP 4: Download images ──────────────────────────────────────────────
  console.log("STEP 4: Downloading images...\n");

  let downloaded = 0, skipped = 0, failed = 0;
  const failedCodes = [];

  for (let i = 0; i < uniqueCodes.length; i++) {
    const code = uniqueCodes[i];
    const url  = `${BANDAI_CDN}/${code}.png`;
    const dest = path.join(OUTPUT_DIR, `${code}.png`);

    // Per-image freshness check: skip if file exists and is young enough
    if (!FORCE_REFRESH && fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 1000 && (Date.now() - stat.mtimeMs) < MAX_AGE_MS) {
        skipped++;
        continue;  // Fresh — skip without printing (would be too noisy)
      }
    }

    const pct = String(Math.round((i / uniqueCodes.length) * 100)).padStart(3);
    process.stdout.write(`[${pct}%] [${String(i+1).padStart(4)}/${uniqueCodes.length}] ${code.padEnd(24)}`);

    const result = await downloadImage(url, dest, FORCE_REFRESH);

    if (result.ok && result.cached) {
      skipped++;
      process.stdout.write(`  ✓ cached\n`);
    } else if (result.ok) {
      downloaded++;
      process.stdout.write(`  ↓ ${((result.bytes||0)/1024).toFixed(0)}kb\n`);
      await sleep(DELAY_MS);
    } else {
      failed++;
      failedCodes.push(code);
      // Don't print — already printed in downloadImage
    }
  }

  // ── STEP 5: Update state and write manifest ──────────────────────────────
  console.log("\nSTEP 5: Updating state and manifest...\n");

  // Mark synced sets
  for (const set of setsToSync) {
    state.sets[set.slug] = {
      last_synced: now,
      name: set.name || set.slug,
    };
  }

  // Full manifest of every available image
  const available = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith(".png") && f !== "placeholder.png")
    .map(f => f.replace(".png", ""))
    .sort();

  // Group by set prefix
  const bySet = {};
  for (const code of available) {
    const key = code.replace(/^([A-Z]+\d+).*/, "$1");
    if (!bySet[key]) bySet[key] = [];
    bySet[key].push(code);
  }

  const manifest = {
    generated_at: now,
    total_images: available.length,
    sets_synced: Object.keys(state.sets).length,
    by_set: bySet,
    all_codes: available,
  };

  if (failedCodes.length > 0) {
    manifest.failed_codes = failedCodes;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  saveState(state);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Downloaded : ${downloaded} new images`);
  console.log(`  Skipped    : ${skipped} (fresh cache)`);
  console.log(`  Failed     : ${failed} (not on CDN or blocked)`);
  console.log(`  Total avail: ${available.length} images in library`);
  console.log(`  Sets synced: ${setsToSync.length}`);
  if (newSetsFound.length > 0) {
    console.log(`\n  ⚠️  ACTION REQUIRED: Add these new sets to ALL_SETS in download-all-images.mjs:`);
    newSetsFound.forEach(s => console.log(`     { slug: "${s}", name: "${s.toUpperCase()} [NAME]", released: "YYYY-MM-DD", cards: 0 },`));
  }
  if (failedCodes.length > 0) {
    console.log(`\n  Failed codes saved to manifest.json (${failedCodes.length} codes)`);
  }
  const nextSync = new Date(Date.now() + MAX_AGE_MS);
  console.log(`\n  Next full sync due: ${nextSync.toDateString()}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
