/**
 * download-images.mjs
 *
 * Downloads One Piece TCG card images from Bandai's CDN.
 * Run at Netlify build time: node scripts/download-images.mjs
 *
 * Covers every manga rare, SP, SAA, parallel, and chase card
 * across OP-01 through OP-15, EB-01 through EB-03, PRB-01, PRB-02.
 *
 * Images saved to: public/images/cards/[CODE].png
 * Manifest written to: public/images/cards/manifest.json
 *
 * HOW TO ADD NEW CARDS:
 *   Add the Bandai code to the appropriate set block below.
 *   Code format: [CARD-NUMBER]_[VARIANT]
 *     p1 = first parallel/alt art
 *     p2 = second parallel (manga alt art is usually p2)
 *     p3 = third parallel (Red SAA in OP-13)
 *     p4/p5/p6/p7/p8 = additional variants (Gold/Silver SPs)
 *     r1/r2 = reprint variants (PRB sets)
 *     No suffix = base card
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "public", "images", "cards");
const BASE_URL   = "https://en.onepiece-cardgame.com/images/cardlist/card";
const DELAY_MS   = 250; // polite delay between requests

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// =============================================================================
// CARD IMAGE MASTER LIST
// Organized by set. Add new cards here as sets release.
// =============================================================================

const CARD_CODES = [

  // ---------------------------------------------------------------------------
  // OP-01 — ROMANCE DAWN (Dec 2022)
  // ---------------------------------------------------------------------------
  "OP01-001_p1",   // Zoro Leader parallel
  "OP01-002_p1",   // Law Leader parallel
  "OP01-003_p1",   // Luffy Leader parallel ★ CHASE
  "OP01-016_p1",   // Nami SR parallel ★ CHASE
  "OP01-016_p8",   // Nami Comic Parallel PRB-01 ★★ GRAIL
  "OP01-024_p1",   // Luffy SR parallel
  "OP01-025_p1",   // Zoro SR parallel
  "OP01-060_p1",   // Doflamingo Leader parallel
  "OP01-061_p1",   // Kaido Leader parallel
  "OP01-078_p1",   // Hancock SR parallel
  "OP01-078_p2",   // Hancock Manga Alt Art SP ★ CHASE (OP-04)
  "OP01-120_p1",   // Shanks SEC base
  "OP01-120_p2",   // Shanks Manga Alternate Art ★★ GRAIL

  // ---------------------------------------------------------------------------
  // OP-02 — PARAMOUNT WAR (Mar 2023)
  // ---------------------------------------------------------------------------
  "OP02-001_p1",   // Whitebeard Leader parallel
  "OP02-002_p1",   // Garp Leader parallel
  "OP02-013_p1",   // Ace base parallel
  "OP02-013_p2",   // Ace Comic Parallel Manga ★★ GRAIL
  "OP02-013_p3",   // Ace SP Treasure Cup variant
  "OP02-013_r1",   // Ace Comic Parallel PRB-01 ★★ GRAIL
  "OP02-026_p1",   // Sanji Leader parallel
  "OP02-036_p1",   // Nami parallel
  "OP02-049_p1",   // Ivankov parallel
  "OP02-062_p1",   // Luffy parallel
  "OP02-071_p1",   // Magellan parallel
  "OP02-085_p2",   // Magellan Manga Alt Art SP (OP-04)
  "OP02-093_p1",   // Smoker Leader parallel
  "OP02-099_p2",   // Sakazuki Manga Alt Art SP (OP-04)
  "OP02-004_p2",   // Whitebeard Manga Alt Art SP (OP-04)

  // ---------------------------------------------------------------------------
  // OP-03 — PILLARS OF STRENGTH (Jun 2023)
  // ---------------------------------------------------------------------------
  "OP03-001_p1",   // Ace Leader parallel
  "OP03-008_p1",   // Buggy SP (OP-06)
  "OP03-040_p1",   // Nami SEC parallel ★ CHASE
  "OP03-076_p1",   // Rob Lucci SEC parallel
  "OP03-099_p1",   // Katakuri SEC parallel
  "OP03-112_p4",   // Pudding SP (OP-08)
  "OP03-114_p2",   // Big Mom Manga Alt Art SP
  "OP03-122_r1",   // Sogeking Comic Parallel PRB-01
  "ST01-012_p3",   // Luffy Gold Sig SP (OP-03) ★ CHASE
  "ST01-012_p5",   // Luffy Gold Stamped Signature SP (OP-05) ★★★ GRAIL
  "ST03-009_p1",   // Doflamingo Wanted Poster SP
  "ST04-003_p1",   // Kaido Wanted Poster SP
  "OP01-051_p1",   // Kid Wanted Poster SP

  // ---------------------------------------------------------------------------
  // OP-04 — KINGDOMS OF INTRIGUE (Sep 2023)
  // ---------------------------------------------------------------------------
  "OP04-001_p1",   // Vivi Leader parallel
  "OP04-019_p1",   // Doflamingo Leader
  "OP04-024_p2",   // Sugar Manga Alt Art SP
  "OP04-039_p1",   // Rebecca Leader
  "OP04-044_p2",   // Kaido Manga Alt Art SP
  "OP04-058_p1",   // Crocodile Leader
  "OP04-064_p2",   // Robin Manga Alt Art SP (OP-06)
  "OP04-083_p1",   // Sabo Manga SEC ★★ GRAIL
  "OP04-083_r1",   // Sabo Comic Parallel PRB-01
  "OP01-047_p2",   // Law Manga Alt Art SP

  // ---------------------------------------------------------------------------
  // OP-05 — AWAKENING OF THE NEW ERA (Nov 2023)
  // THE MOST IMPORTANT SET — ALL VARIANTS
  // ---------------------------------------------------------------------------
  "OP05-060_p1",   // Luffy Leader parallel
  "OP05-060_p4",   // Luffy SP Leader EB-02 ★★★★ GRAIL ($3,000-$5,000)
  "OP05-067_p4",   // Zoro-Juurou SP (OP-09)
  "OP05-069_p1",   // Law Manga Alt Art ★★ GRAIL
  "OP05-069_r1",   // Law Comic Parallel PRB-01 ★★ GRAIL
  "OP05-074_p1",   // Kid Manga Alt Art ★★ GRAIL
  "OP05-074_p3",   // Kid SP (OP-07)
  "OP05-091_p2",   // Rebecca SP (OP-06)
  "OP05-098_p1",   // Enel SR parallel
  "OP05-098_p2",   // Enel SP EB-02
  "OP05-100_p2",   // Enel Manga Alt Art SP
  "OP05-119_p1",   // Luffy Gear 5 SEC base
  "OP05-119_p2",   // Luffy Gear 5 Manga Alt Art ★★ GRAIL
  "OP05-119_p4",   // Luffy Gear 5 SP Gold (PRB-01)
  "OP05-119_p5",   // Luffy Gold Stamped Signature SP ★★★★ GRAIL ($6,889)
  "OP05-119_p6",   // Luffy Gear 5 Silver (OP-09)
  "OP05-119_p7",   // Luffy 3rd Anniv SP Silver (OP-11) ★★ CHASE
  "OP05-119_p8",   // Luffy 3rd Anniv SP Gold (OP-11) ★★★ CHASE
  "OP05-119_r2",   // Luffy Comic Parallel PRB-01 ★★★ GRAIL (~$2,950)
  "OP01-121_p2",   // Yamato Manga Alt Art SP

  // ---------------------------------------------------------------------------
  // OP-06 — WINGS OF THE CAPTAIN (Mar 2024)
  // ---------------------------------------------------------------------------
  "OP06-021_p1",   // Perona SR parallel
  "OP06-021_p2",   // Perona SP EB-02
  "OP06-022_p1",   // Yamato Leader parallel
  "OP06-022_p2",   // Yamato SP EB-02
  "OP06-047_p1",   // Pudding SP reprint (PRB-02)
  "OP06-093_p5",   // Perona parallel (OP-14)
  "OP06-101_p2",   // O-Nami SP (OP-07)
  "OP06-118_p1",   // Zoro SEC base
  "OP06-118_p2",   // Zoro Manga Alt Art ★★★ GRAIL
  "OP06-118_p3",   // Zoro SP (OP-11)
  "OP06-118_r1",   // Zoro Comic Parallel PRB-01 ★★ GRAIL
  "OP06-119_p1",   // Sanji Manga Alt Art PRB-02 ★★★ GRAIL
  "ST01-007_p1",   // Nami Treasure Rare (OP-06)

  // ---------------------------------------------------------------------------
  // OP-07 — 500 YEARS IN THE FUTURE (Jun 2024)
  // ---------------------------------------------------------------------------
  "OP07-019_p1",   // Bonney SEC parallel
  "OP07-019_p2",   // Bonney SP EB-02
  "OP07-038_p1",   // Hancock SR parallel
  "OP07-038_p2",   // Hancock SP EB-02
  "OP07-051_p1",   // Hancock SR base
  "OP07-051_p2",   // Hancock Manga Alt Art ★★★ GRAIL (~$2,192)
  "OP07-051_p3",   // Hancock SP (OP-09)
  "OP07-097_p2",   // Vegapunk SP EB-02
  "OP07-109_p1",   // Luffy TR
  "OP07-109_p2",   // Luffy SP (OP-08)
  "OP01-073_p2",   // Doflamingo SP (OP-07)
  "ST10-010_p2",   // Law SP (OP-07)
  "OP01-035_p2",   // Okiku SP (OP-07)
  "OP03-003_p1",   // Izo SP (OP-07)

  // ---------------------------------------------------------------------------
  // OP-08 — TWO LEGENDS (Sep 2024)
  // ---------------------------------------------------------------------------
  "OP08-001_p1",   // Chopper Leader parallel
  "OP08-052_p2",   // Ace SP (OP-10)
  "OP08-106_p1",   // Nami SR parallel
  "OP08-106_p2",   // Nami SP (OP-09)
  "OP08-118_p1",   // Rayleigh SEC base
  "OP08-118_p2",   // Rayleigh Manga Alt Art ★★ GRAIL
  "ST02-007_p2",   // Bonney SP (OP-08)
  "ST03-004_p1",   // Moria SP (OP-08)
  "ST04-005_p1",   // Queen SP (OP-08)
  "ST06-006_p2",   // Tashigi SP (OP-08)

  // ---------------------------------------------------------------------------
  // OP-09 — EMPERORS IN THE NEW WORLD (Dec 2024)
  // HIGH PRIORITY — Box EV $1,016
  // ---------------------------------------------------------------------------
  "OP09-004_p1",   // Shanks SR base
  "OP09-004_p2",   // Shanks SP Gold ★★ CHASE
  "OP09-004_p3",   // Shanks SP Silver
  "OP09-004_p5",   // Shanks SP Gold (OP-13) ★★ CHASE
  "OP09-004_p6",   // Shanks SP Silver (OP-13)
  "OP09-051_p1",   // Buggy SR base
  "OP09-051_p2",   // Buggy SP Gold (OP-09) ★★ CHASE
  "OP09-051_p3",   // Buggy SP Silver (OP-09)
  "OP09-051_p4",   // Buggy SP Gold Anniversary (OP-14) ★★ CHASE ($2,400)
  "OP09-051_p5",   // Buggy SP Silver Anniversary (OP-14) ★★ CHASE ($1,325)
  "OP09-093_p1",   // Teach SR base
  "OP09-093_p2",   // Teach SP Gold ★★ CHASE
  "OP09-093_p3",   // Teach SP Silver (OP-12) ★★ CHASE (~$850)
  "OP09-093_p4",   // Teach SP Gold (OP-12)
  "OP09-118_p1",   // Roger SEC base
  "OP09-118_p2",   // Roger Gold Manga Alt Art ★★★ GRAIL ($3,574)
  "OP09-119_p1",   // Luffy SEC base
  "OP09-119_p2",   // Luffy Manga Alt Art ★★ GRAIL ($1,441)
  "OP09-119_p3",   // Luffy SP Silver (OP-13)

  // ---------------------------------------------------------------------------
  // OP-10 — ROYAL BLOOD (Mar 2025)
  // ---------------------------------------------------------------------------
  "OP10-019_p1",   // Divine Departure parallel
  "OP10-063_p1",   // Sanji TR (OP-12)
  "OP10-065_p1",   // Sugar parallel (OP-14)
  "OP10-099_p1",   // Kid SR parallel
  "OP10-118_p1",   // Luffy SR parallel
  "OP10-119_p1",   // Law SEC base
  "OP10-119_p2",   // Law Manga Alt Art ★★ GRAIL
  "ST12-012_p1",   // Pudding SP (OP-10)
  "ST14-003_p1",   // Sanji SP (OP-10)
  "EB01-056_p2",   // Flampe SP (OP-10)

  // ---------------------------------------------------------------------------
  // OP-11 — A FIST OF DIVINE SPEED (Jun 2025)
  // ---------------------------------------------------------------------------
  "OP11-047_p1",   // Reiju SR parallel
  "OP11-057_p1",   // Pudding SR parallel
  "OP11-058_p1",   // Luffy Treasure Rare
  "OP11-099_p1",   // Katakuri SEC parallel
  "OP11-118_p1",   // Luffy Snakeman SEC base
  "OP11-118_p2",   // Luffy Snakeman Manga Alt Art ★★ GRAIL (~$310)
  "ST16-004_p1",   // Shanks SP (OP-11)
  // OP05-119_p7 and _p8 already listed above

  // ---------------------------------------------------------------------------
  // OP-12 — LEGACY OF THE MASTER (Aug 2025)
  // ---------------------------------------------------------------------------
  "OP12-020_p1",   // Zoro Leader parallel
  "OP12-030_p1",   // Mihawk SR parallel
  "OP12-030_p2",   // Mihawk SR parallel alt (OP-14)
  "OP12-118_p1",   // Bonney SEC base
  "OP12-118_p2",   // Bonney Manga Alt Art ★★ GRAIL
  "OP12-119_p1",   // Kuma SEC parallel
  "ST13-011_p1",   // Ace SP (OP-12)
  "ST18-004_p1",   // Zoro SP (OP-12)
  "OP06-050_p1",   // Tashigi SP (OP-12)
  // OP09-093_p3 and _p4 (Teach Silver/Gold) already listed above

  // ---------------------------------------------------------------------------
  // OP-13 — CARRYING ON HIS WILL (Nov 2025)
  // THE MOST VALUABLE SET — ALL VARIANTS
  // ---------------------------------------------------------------------------
  // RED Super Alternate Arts ★★★★ ABSOLUTE GRAILS
  "OP13-118_p3",   // Luffy Red SAA ★★★★ #1 card in game ($8,490)
  "OP13-119_p3",   // Ace Red SAA ★★★★ ($4,420-$6,400)
  "OP13-120_p3",   // Sabo Red SAA ★★★★ ($4,750-$10,000+)

  // Standard SAA (Super Alternate Art) ★★★
  "OP13-118_p1",   // Luffy SEC base
  "OP13-118_p2",   // Luffy SAA ★★★ ($1,949-$3,200)
  "OP13-119_p1",   // Ace SEC base
  "OP13-119_p2",   // Ace SAA ★★★ ($1,198-$1,498)
  "OP13-119_p4",   // Ace SP Gold
  "OP13-120_p1",   // Sabo SEC base
  "OP13-120_p2",   // Sabo SAA ★★★ ($847-$860)

  // Demon Pack — Five Elders + Imu ★★★
  "OP13-079_p1",   // Imu Alternate Art (Demon Pack)
  "OP13-080_p1",   // Nusjuro Alternate Art (Demon Pack) ★★★ (~$549)
  "OP13-083_p1",   // Saturn Alternate Art (Demon Pack) ★★★ (~$521)
  "OP13-084_p1",   // Ju Peter Alternate Art (Demon Pack) ★★★ (~$500)
  "OP13-089_p1",   // Warcury Alternate Art (Demon Pack) ★★★ (~$468)
  "OP13-091_p1",   // Mars Alternate Art (Demon Pack) ★★★ (~$512)

  // SP Gold/Silver in OP-13 (Shanks/Buggy variants already listed above)
  // OP09-004_p5, OP09-004_p6, OP09-119_p3 already listed

  // ---------------------------------------------------------------------------
  // OP-14 — THE AZURE SEA'S SEVEN (Jan 2026)
  // ---------------------------------------------------------------------------
  "OP14-041_p1",   // Hancock parallel
  "OP14-112_p2",   // Hancock SP
  "OP14-118_p1",   // Event parallel
  "OP14-119_p1",   // Mihawk SEC base
  "OP14-119_p2",   // Mihawk Manga Alt Art ★★ GRAIL ($1,100-$1,200)
  "EB04-039_p1",   // Kid SP (OP-14)
  // Buggy Gold/Silver and Shanks gold already listed above

  // ---------------------------------------------------------------------------
  // OP-15 — ADVENTURE ON KAMI'S ISLAND (Apr 3 2026) — BRAND NEW
  // ---------------------------------------------------------------------------
  "OP15-118_p1",   // Enel SEC base
  "OP15-118_p2",   // Enel Manga Alt Art ★★ GRAIL (settling ~$947)
  "OP15-119_p1",   // Luffy SEC
  "OP15-098_p1",   // Luffy SP Leader

  // ---------------------------------------------------------------------------
  // EB-01 — MEMORIAL COLLECTION (Sep 2023)
  // ---------------------------------------------------------------------------
  "EB01-001_p1",   // Oden Leader parallel
  "EB01-006_p1",   // Chopper SR base parallel
  "EB01-006_p2",   // Chopper Manga Alt Art ★★★ GRAIL ($2,000-$3,250)
  "EB01-006_r1",   // Chopper Comic Parallel PRB-01 ★★★ GRAIL ($3,500-$4,500)
  "EB01-012_p1",   // Cavendish parallel
  "EB01-013_p1",   // Hiyori parallel
  "EB01-040_p1",   // Kyros parallel
  "EB01-046_p1",   // Brook parallel
  "EB01-048_p1",   // Laboon parallel
  "EB01-056_p2",   // Flampe SP
  "EB01-061_p1",   // Mr. 2 SEC parallel

  // ---------------------------------------------------------------------------
  // EB-02 — ANIME 25TH COLLECTION (Sep 2024)
  // ---------------------------------------------------------------------------
  "EB02-010_p1",   // Luffy SPR Leader base
  "EB02-061_p1",   // Luffy Gear 2 SEC base
  "EB02-061_p2",   // Luffy Gear 2 Manga Alt Art ★★★ GRAIL ($2,200+)
  // OP05-060_p4 (Luffy SP Leader) already listed above
  // Bonney, Hancock, Yamato, Perona, Vegapunk, Sabo, Enel SPs already listed

  // ---------------------------------------------------------------------------
  // EB-03 — HEROINES EDITION (Feb 2026)
  // ---------------------------------------------------------------------------
  "EB03-003_p2",   // Uta SP Leader
  "EB03-018_p2",   // Tashigi SP
  "EB03-024_p1",   // Vivi SR base
  "EB03-024_p2",   // Vivi SP Manga Alt Art ★★ GRAIL ($652)
  "EB03-026_p1",   // Hancock SR base
  "EB03-026_p2",   // Hancock SP Manga Alt Art ★★★ GRAIL ($1,149)
  "EB03-042_p2",   // Koala SP
  "EB03-053_p1",   // Nami SR base
  "EB03-053_p2",   // Nami SP Manga Alt Art ★★★ GRAIL ($1,580)
  "EB03-055_p1",   // Robin SR base
  "EB03-055_p2",   // Robin SP Manga Alt Art ★★★ GRAIL ($1,325)
  "EB03-061_p1",   // Uta SEC base
  "EB03-061_p2",   // Uta Manga Alt Art ★★★ GRAIL ($1,547)

  // ---------------------------------------------------------------------------
  // PRB-01 — ONE PIECE CARD THE BEST (Mar 2024)
  // ---------------------------------------------------------------------------
  // Comic Parallels (new art) ★★★
  // OP05-119_r2 (Luffy) already listed above
  // EB01-006_r1 (Chopper) already listed above
  // OP01-016_p8 (Nami) already listed above
  // OP06-118_r1 (Zoro) already listed above
  // OP05-069_r1 (Law) already listed above
  // OP02-013_r1 (Ace) already listed above
  // OP04-083_r1 (Sabo) already listed above
  // OP03-122_r1 (Sogeking) already listed above
  "OP05-119_p4",   // Luffy SP Gold (PRB-01) — ensure listed
  "ST03-013_p4",   // Hancock SP (PRB-01)

  // ---------------------------------------------------------------------------
  // PRB-02 — THE BEST VOL. 2 (Oct 2025)
  // ---------------------------------------------------------------------------
  // OP06-119_p1 (Sanji Manga) already listed above
  "ST16-004_p2",   // Shanks SP reprint
  "ST15-002_p1",   // Whitebeard SP reprint

];

// Deduplicate while preserving order
const seen = new Set();
const UNIQUE_CODES = CARD_CODES.filter((c) => {
  if (seen.has(c)) return false;
  seen.add(c);
  return true;
});

// =============================================================================
// DOWNLOAD ENGINE
// =============================================================================

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    if (fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      if (size > 1000) {
        process.stdout.write(`  ✓ cached   ${path.basename(destPath)}\n`);
        resolve({ ok: true, cached: true });
        return;
      }
      fs.unlinkSync(destPath); // Re-download if suspiciously small
    }

    const file = fs.createWriteStream(destPath);
    let done = false;

    const fail = (reason) => {
      if (done) return;
      done = true;
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      process.stdout.write(`  ✗ ${String(reason).padEnd(14)} ${path.basename(destPath)}\n`);
      resolve({ ok: false, reason });
    };

    const request = (targetUrl, hops = 0) => {
      if (hops > 5) { fail("too many redirects"); return; }
      const lib = targetUrl.startsWith("https") ? https : http;

      const req = lib.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; site-builder/1.0)",
          "Accept": "image/png,image/*,*/*",
          "Referer": "",   // No referrer — bypass hotlink block
        },
        timeout: 15000,
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
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
              process.stdout.write(`  ↓ ${String(size).padStart(9)} bytes  ${path.basename(destPath)}\n`);
              resolve({ ok: true, cached: false });
            }
          });
        });
      });

      req.on("error", (e) => fail(e.code || e.message));
      req.on("timeout", () => { req.destroy(); fail("timeout"); });
    };

    request(url);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("══════════════════════════════════════════════════════════");
  console.log("  One Piece TCG — Card Image Downloader");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Output : ${OUTPUT_DIR}`);
  console.log(`  Cards  : ${UNIQUE_CODES.length} unique images`);
  console.log(`  Delay  : ${DELAY_MS}ms between requests`);
  console.log("══════════════════════════════════════════════════════════\n");

  let downloaded = 0, cached = 0, failed = 0;
  const failedList = [];

  for (let i = 0; i < UNIQUE_CODES.length; i++) {
    const code = UNIQUE_CODES[i];
    const url  = `${BASE_URL}/${code}.png`;
    const dest = path.join(OUTPUT_DIR, `${code}.png`);

    process.stdout.write(`[${String(i + 1).padStart(3)}/${UNIQUE_CODES.length}] `);

    const result = await downloadFile(url, dest);

    if (result.ok && result.cached) cached++;
    else if (result.ok) downloaded++;
    else { failed++; failedList.push(code); }

    if (!result.cached) await sleep(DELAY_MS);
  }

  // Write manifest so HTML knows which images are available
  const available = UNIQUE_CODES.filter((c) => {
    const p = path.join(OUTPUT_DIR, `${c}.png`);
    return fs.existsSync(p) && fs.statSync(p).size > 500;
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify({
      downloaded_at: new Date().toISOString(),
      total_attempted: UNIQUE_CODES.length,
      total_available: available.length,
      images: available,
      failed: failedList,
    }, null, 2)
  );

  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  Downloaded : ${downloaded}`);
  console.log(`  Cached     : ${cached}`);
  console.log(`  Failed     : ${failed}`);
  console.log(`  Available  : ${available.length} images in manifest`);
  if (failedList.length > 0) {
    console.log(`\n  Failed (not on Bandai CDN or blocked):`);
    failedList.forEach((c) => console.log(`    - ${c}`));
  }
  console.log("══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
