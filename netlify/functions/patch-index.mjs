/**
 * patch-index.mjs
 *
 * Surgically patches the index.html to add a new set tab and nav button
 * without touching any existing content.
 *
 * Insertions:
 *   1. Nav button — inserted before the SPECIAL nav group label
 *   2. Set section HTML — inserted before the price warning banner
 *   3. PRICE_MAP entry — added to the JS PRICE_MAP object in the page script
 *   4. Version badge — updated with today's date and new set name
 */

import fs from "fs";
import path from "path";

const INDEX_PATH = path.join(process.cwd(), "public", "index.html");

// ─── Insertion Anchors ───────────────────────────────────────────────────────
// These strings mark exactly where we insert new content in the HTML.
// They must remain stable in index.html.

const NAV_MAIN_SETS_END   = "  <div class=\"nav-group-label\">SPECIAL</div>";
const SECTION_INSERT_AFTER = "<!-- NAV_INSERT_SETS_END -->";  // fallback
const PRICE_WARNING_MARKER = "<!-- PRICE ACCURACY WARNING BANNER -->";
const UPDATED_BADGE_CLASS  = "class=\"updated-badge\"";

// ─── Helpers ────────────────────────────────────────────────────────────────
function readIndex() {
  return fs.readFileSync(INDEX_PATH, "utf8");
}

function writeIndex(html) {
  // Backup the previous version
  const backupPath = INDEX_PATH.replace(".html", `.backup-${Date.now()}.html`);
  fs.copyFileSync(INDEX_PATH, backupPath);
  console.log(`[patch-index] Backed up to ${path.basename(backupPath)}`);

  fs.writeFileSync(INDEX_PATH, html);
  console.log(`[patch-index] index.html updated`);
}

// Check if a set ID already exists in the HTML
export function setAlreadyExists(setId) {
  const html = readIndex();
  return html.includes(`id="${setId}"`);
}

// ─── Main Patch Function ─────────────────────────────────────────────────────
export function patchIndex(result) {
  const { setCode, setId, navButton, sectionHtml, priceTargets, data } = result;

  let html = readIndex();

  // Safety check
  if (html.includes(`id="${setId}"`)) {
    console.log(`[patch-index] ${setId} already exists in index.html — skipping`);
    return false;
  }

  let patched = false;

  // ── 1. Insert nav button ───────────────────────────────────────────────────
  // Insert before "SPECIAL" nav group label, after the last main set button.
  // New OP sets go before SPECIAL; EB/PRB sets go after EB-01 group label.
  const isMainSet = setCode.toUpperCase().startsWith("OP");
  const isEB      = setCode.toUpperCase().startsWith("EB");
  const isPRB     = setCode.toUpperCase().startsWith("PRB");

  if (isMainSet) {
    // Insert before SPECIAL label (after last OP set button)
    if (html.includes(NAV_MAIN_SETS_END)) {
      html = html.replace(
        NAV_MAIN_SETS_END,
        `${navButton}\n${NAV_MAIN_SETS_END}`
      );
      console.log(`[patch-index] ✓ Nav button inserted (main set position)`);
      patched = true;
    }
  } else if (isEB || isPRB) {
    // Insert before SPECIAL label as well (extra/premium sets group)
    if (html.includes(NAV_MAIN_SETS_END)) {
      html = html.replace(
        NAV_MAIN_SETS_END,
        `${navButton}\n${NAV_MAIN_SETS_END}`
      );
      console.log(`[patch-index] ✓ Nav button inserted (extra/premium position)`);
      patched = true;
    }
  }

  if (!patched) {
    console.error(`[patch-index] ❌ Could not find nav insertion point`);
    return false;
  }

  // ── 2. Insert set section HTML ─────────────────────────────────────────────
  // Insert just before the PRICE ACCURACY WARNING BANNER div.
  // This puts new sets right at the start of the main content area,
  // which is correct because they default to display:none until clicked.
  if (html.includes(PRICE_WARNING_MARKER)) {
    html = html.replace(
      PRICE_WARNING_MARKER,
      `${sectionHtml}\n\n${PRICE_WARNING_MARKER}`
    );
    console.log(`[patch-index] ✓ Set section HTML inserted`);
  } else {
    console.error(`[patch-index] ❌ Could not find section insertion point`);
    return false;
  }

  // ── 3. Add price targets to PRICE_MAP in the page JS ──────────────────────
  // Find the PRICE_MAP object and append new entries
  if (priceTargets && priceTargets.length > 0) {
    const PRICE_MAP_MARKER = "const PRICE_MAP = {";
    if (html.includes(PRICE_MAP_MARKER)) {
      // Find the last entry in PRICE_MAP (just before the closing };)
      const mapStart = html.indexOf(PRICE_MAP_MARKER);
      const mapEnd   = html.indexOf("};", mapStart);

      if (mapEnd > mapStart) {
        // Build new PRICE_MAP entries
        const newEntries = priceTargets.map(t => {
          // Generate a CSS selector based on the set section
          // This is a best-effort selector — exact row depends on card position
          const selector = `#${setId} tbody tr:nth-child(${
            (data.top_cards || []).findIndex(c =>
              c.name && t.label && c.name.includes(t.label.split(" ")[0])
            ) + 1 || 1
          }) .price-cell`;
          return `  ${t.id}: '${selector}',`;
        }).join("\n");

        html = html.slice(0, mapEnd) + newEntries + "\n" + html.slice(mapEnd);
        console.log(`[patch-index] ✓ Added ${priceTargets.length} entries to PRICE_MAP`);
      }
    }
  }

  // ── 4. Update version badge ────────────────────────────────────────────────
  const today    = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const badgeIdx = html.indexOf(UPDATED_BADGE_CLASS);

  if (badgeIdx > -1) {
    // Replace content between > and </div>
    const gtIdx     = html.indexOf(">", badgeIdx);
    const closeIdx  = html.indexOf("</div>", gtIdx);
    if (gtIdx > -1 && closeIdx > gtIdx) {
      const currentBadge = html.slice(gtIdx + 1, closeIdx);
      // Extract version number and bump it
      const vMatch = currentBadge.match(/v(\d+)\.(\d+)/);
      let newVersion = "v2.1";
      if (vMatch) {
        newVersion = `v${vMatch[1]}.${parseInt(vMatch[2]) + 1}`;
      }
      const newBadge = `${newVersion} · Updated ${today} · ${setCode} added automatically · English Only`;
      html = html.slice(0, gtIdx + 1) + newBadge + html.slice(closeIdx);
      console.log(`[patch-index] ✓ Version badge updated to ${newVersion}`);
    }
  }

  // ── Write updated HTML ─────────────────────────────────────────────────────
  writeIndex(html);
  return true;
}

// ─── State Tracking ──────────────────────────────────────────────────────────
const STATE_FILE = path.join(process.cwd(), "public", "auto-sets-state.json");

export function loadAutoSetsState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {}
  return { processed_sets: [], failed_sets: [], last_check: null };
}

export function saveAutoSetsState(state) {
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
