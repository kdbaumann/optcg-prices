/**
 * download-all-images.mjs
 *
 * Complete One Piece TCG image downloader.
 *
 * STRATEGY:
 *   1. Fetch each set page from opcardlist.com
 *   2. Parse all Bandai CDN image URLs from the page HTML
 *   3. Download every unique image to public/images/cards/
 *   4. Write a manifest of everything available
 *
 * This gives 100% coverage of every card ever indexed — base cards,
 * all parallels, all variants, all SP/SAA/manga arts — automatically,
 * without needing to manually list every code.
 *
 * USAGE:
 *   node scripts/download-all-images.mjs              # download everything
 *   node scripts/download-all-images.mjs --refresh    # re-download even cached
 *   node scripts/download-all-images.mjs --sets op-01,op-09  # specific sets only
 *
 * OUTPUT:
 *   public/images/cards/[CODE].png   — one file per card image
 *   public/images/cards/manifest.json — index of all available images
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "public", "images", "cards");
const BANDAI_CDN = "https://en.onepiece-cardgame.com/images/cardlist/card";
const OPCARDLIST = "https://www.opcardlist.com";
const DELAY_MS   = 200;   // Between image downloads (polite to Bandai)
const PAGE_DELAY = 1500;  // Between OPCardlist page fetches

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Parse CLI args
const args = process.argv.slice(2);
const FORCE_REFRESH = args.includes("--refresh");
const SET_FILTER = args.find(a => a.startsWith("--sets="))?.split("=")[1]?.split(",") || null;

// =============================================================================
// SET INDEX — all sets on OPCardlist
// Add new sets here as they release. URL slug -> display name
// =============================================================================
const ALL_SETS = [
  // Main booster sets
  { slug: "op-01",       name: "OP-01 Romance Dawn",                cards: 154 },
  { slug: "op-02",       name: "OP-02 Paramount War",               cards: 154 },
  { slug: "op-03",       name: "OP-03 Pillars of Strength",         cards: 154 },
  { slug: "op-04",       name: "OP-04 Kingdoms of Intrigue",        cards: 149 },
  { slug: "op-05",       name: "OP-05 Awakening of the New Era",    cards: 154 },
  { slug: "op-06",       name: "OP-06 Wings of the Captain",        cards: 151 },
  { slug: "op-07",       name: "OP-07 500 Years in the Future",     cards: 151 },
  { slug: "op-08",       name: "OP-08 Two Legends",                 cards: 151 },
  { slug: "op-09",       name: "OP-09 Emperors in the New World",   cards: 159 },
  { slug: "op-10",       name: "OP-10 Royal Blood",                 cards: 151 },
  { slug: "op-11",       name: "OP-11 A Fist of Divine Speed",      cards: 156 },
  { slug: "op-12",       name: "OP-12 Legacy of the Master",        cards: 155 },
  { slug: "op-13",       name: "OP-13 Carrying On His Will",        cards: 175 },
  { slug: "op14-eb04",   name: "OP-14/EB-04 Azure Sea's Seven",     cards: 199 },
  // Extra boosters
  { slug: "eb-01",       name: "EB-01 Memorial Collection",         cards: 80  },
  { slug: "eb-02",       name: "EB-02 Anime 25th Collection",       cards: 105 },
  { slug: "eb-03",       name: "EB-03 Heroines Edition",            cards: 90  },
  // Premium boosters
  { slug: "prb-01",      name: "PRB-01 Card The Best",              cards: 319 },
  // Other / Promo
  { slug: "other-product", name: "Other Product Cards",             cards: 57  },
  { slug: "promo",       name: "Promotion Cards",                   cards: 336 },
];

// =============================================================================
// HTTP UTILITIES
// =============================================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchText(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; card-image-fetcher/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "en-US,en;q=0.9",
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
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve(body));
      });
      req.on("error", e => {
        if (n > 0) { sleep(2000).then(() => attempt(n - 1)); return; }
        reject(e);
      });
      req.on("timeout", () => {
        req.destroy();
        if (n > 0) { sleep(2000).then(() => attempt(n - 1)); return; }
        reject(new Error("Timeout"));
      });
    };
    attempt(retries);
  });
}

function downloadImage(url, destPath, forceRefresh = false) {
  return new Promise(resolve => {
    // Check cache
    if (!forceRefresh && fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      if (size > 1000) {
        process.stdout.write(`  ✓ cached\n`);
        resolve({ ok: true, cached: true });
        return;
      }
      fs.unlinkSync(destPath); // Too small, re-download
    }

    const file = fs.createWriteStream(destPath);
    let done = false;

    const fail = reason => {
      if (done) return;
      done = true;
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      process.stdout.write(`  ✗ ${String(reason).slice(0,20)}\n`);
      resolve({ ok: false, reason });
    };

    const request = (targetUrl, hops = 0) => {
      if (hops > 5) { fail("too many redirects"); return; }
      const lib = targetUrl.startsWith("https") ? https : http;
      const req = lib.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; card-image-fetcher/1.0)",
          "Accept": "image/png,image/*,*/*",
          "Referer": "",  // Strip referrer to bypass hotlink block
        },
        timeout: 15000,
      }, res => {
        if ([301,302,307,308].includes(res.statusCode)) {
          res.resume();
          request(res.headers.location, hops + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          fail(`HTTP ${res.statusCode}`);
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          if (done) return;
          done = true;
          file.close(() => {
            const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
            if (size < 500) {
              try { fs.unlinkSync(destPath); } catch {}
              fail("too small");
            } else {
              process.stdout.write(`  ↓ ${(size/1024).toFixed(0)}kb\n`);
              resolve({ ok: true, cached: false });
            }
          });
        });
      });
      req.on("error", e => fail(e.code || e.message));
      req.on("timeout", () => { req.destroy(); fail("timeout"); });
    };

    request(url);
  });
}

// =============================================================================
// PARSER — extract Bandai image codes from OPCardlist HTML
// =============================================================================

function extractImageCodes(html) {
  const codes = new Set();

  // OPCardlist embeds Bandai CDN URLs like:
  // https://en.onepiece-cardgame.com/images/cardlist/card/OP01-003_p1.png?260130
  // https://en.onepiece-cardgame.com/images/cardlist/card/OP09-118.png?260130
  const imgRegex = /\/images\/cardlist\/card\/([A-Z0-9\-]+(?:_[a-z][0-9]+)?)\.png/g;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    codes.add(match[1]);
  }

  // Also catch card links like /card/op01-003_p1 which use lowercase
  const linkRegex = /\/card\/([a-z][a-z0-9\-]+(?:_[a-z][0-9]+)?)/g;
  while ((match = linkRegex.exec(html)) !== null) {
    // Convert to uppercase Bandai format: op01-003_p1 -> OP01-003_p1
    const raw = match[1];
    const upper = raw.replace(/^([a-z]+)(\d+)-(\d+)(_[a-z]\d+)?$/, (_, prefix, setNum, cardNum, variant) => {
      return `${prefix.toUpperCase()}${setNum}-${cardNum}${variant || ""}`;
    });
    if (upper !== raw && upper.match(/^[A-Z]+\d+-\d+/)) {
      codes.add(upper);
    }
  }

  return [...codes];
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  One Piece TCG — Complete Card Image Downloader");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Output   : ${OUTPUT_DIR}`);
  console.log(`  Refresh  : ${FORCE_REFRESH ? "YES (re-downloading all)" : "NO (skip cached)"}`);
  if (SET_FILTER) console.log(`  Sets     : ${SET_FILTER.join(", ")}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const sets = SET_FILTER
    ? ALL_SETS.filter(s => SET_FILTER.some(f => s.slug.includes(f) || f.includes(s.slug)))
    : ALL_SETS;

  if (sets.length === 0) {
    console.error("No sets matched the filter. Check --sets argument.");
    process.exit(1);
  }

  // Track all codes found and results
  const allCodes   = new Set();
  const setResults = [];

  // ── PHASE 1: Scrape all set pages to collect image codes ──────────────────
  console.log("PHASE 1: Scraping set pages from OPCardlist...\n");

  for (const set of sets) {
    const url = `${OPCARDLIST}/${set.slug}`;
    process.stdout.write(`  Fetching ${set.name.padEnd(42)} `);

    try {
      const html = await fetchText(url);
      const codes = extractImageCodes(html);
      codes.forEach(c => allCodes.add(c));
      process.stdout.write(`→ ${String(codes.length).padStart(3)} images found\n`);
      setResults.push({ set, codes, ok: true });
    } catch (err) {
      process.stdout.write(`→ FAILED: ${err.message}\n`);
      setResults.push({ set, codes: [], ok: false });
    }

    await sleep(PAGE_DELAY);
  }

  const uniqueCodes = [...allCodes].sort();
  console.log(`\nTotal unique image codes found: ${uniqueCodes.length}\n`);

  // ── PHASE 2: Download all images ──────────────────────────────────────────
  console.log("PHASE 2: Downloading card images from Bandai CDN...\n");

  let downloaded = 0, cached = 0, failed = 0;
  const failedCodes = [];

  for (let i = 0; i < uniqueCodes.length; i++) {
    const code = uniqueCodes[i];
    const url  = `${BANDAI_CDN}/${code}.png`;
    const dest = path.join(OUTPUT_DIR, `${code}.png`);

    const pct = String(Math.round((i / uniqueCodes.length) * 100)).padStart(3);
    process.stdout.write(`[${pct}%] [${String(i+1).padStart(4)}/${uniqueCodes.length}] ${code.padEnd(22)}`);

    const result = await downloadImage(url, dest, FORCE_REFRESH);

    if (result.ok && result.cached) {
      cached++;
    } else if (result.ok) {
      downloaded++;
      await sleep(DELAY_MS);
    } else {
      failed++;
      failedCodes.push(code);
    }
  }

  // ── PHASE 3: Write manifest ───────────────────────────────────────────────
  console.log("\nPHASE 3: Writing manifest...\n");

  const available = uniqueCodes.filter(c => {
    const p = path.join(OUTPUT_DIR, `${c}.png`);
    return fs.existsSync(p) && fs.statSync(p).size > 500;
  });

  // Group by set prefix for easy lookup
  const bySet = {};
  for (const code of available) {
    const setKey = code.split("-")[0]; // e.g. "OP01", "EB01", "PRB01"
    if (!bySet[setKey]) bySet[setKey] = [];
    bySet[setKey].push(code);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    total_attempted: uniqueCodes.length,
    total_available: available.length,
    total_failed: failedCodes.length,
    sets_scraped: sets.map(s => s.slug),
    by_set: bySet,
    all_codes: available,
    failed_codes: failedCodes,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Downloaded : ${downloaded}`);
  console.log(`  Cached     : ${cached}`);
  console.log(`  Failed     : ${failed}`);
  console.log(`  Available  : ${available.length} images`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nBy set:");
  for (const [setKey, codes] of Object.entries(bySet).sort()) {
    console.log(`  ${setKey.padEnd(8)}: ${codes.length} images`);
  }

  if (failedCodes.length > 0) {
    console.log(`\nFailed codes (${failedCodes.length}) — not on Bandai CDN or blocked:`);
    failedCodes.slice(0, 30).forEach(c => console.log(`  - ${c}`));
    if (failedCodes.length > 30) console.log(`  ... and ${failedCodes.length - 30} more`);

    // Save failed list separately for debugging
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "failed.json"),
      JSON.stringify({ failed_at: new Date().toISOString(), codes: failedCodes }, null, 2)
    );
    console.log(`\nFailed codes saved to: ${path.join(OUTPUT_DIR, "failed.json")}`);
  }

  console.log("\n✅ Done.");
}

main().catch(err => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
