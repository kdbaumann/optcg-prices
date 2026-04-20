/**
 * generate-set-tab.mjs
 *
 * Given a set code (e.g. "OP-16"), researches the set using Claude + web search
 * and returns:
 *   - The HTML for the new set section (<div class="set-section" id="op16">...)
 *   - The nav button HTML
 *   - Price tracking entries to add to PRICE_TARGETS
 *   - Set metadata (name, release date, card count, chase card, box EV)
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Derive the section ID from a set code: "OP-16" -> "op16", "EB-04" -> "eb04"
export function setCodeToId(setCode) {
  return setCode.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Derive a label for the nav button badge style
function setCodeToStyle(setCode) {
  const upper = setCode.toUpperCase();
  if (upper.startsWith("EB"))  return 'style="border-color:#065f46;color:#6ee7b7"';
  if (upper.startsWith("PRB")) return 'style="border-color:#6d28d9;color:#c4b5fd"';
  if (upper.startsWith("OP"))  return ""; // default gold style
  return "";
}

// ─── Research Prompt ────────────────────────────────────────────────────────
function buildResearchPrompt(setCode, setType = "booster") {
  const typeContext = {
    booster:   "This is a main booster set. Focus on top 10 most valuable cards, box EV, manga rares, SP cards.",
    extra:     "This is an Extra Booster (EB). Focus on top 10 cards, box EV, manga alt arts, SP parallels. EB sets are never reprinted — note this.",
    premium:   "This is a Premium Booster (PRB). Focus on manga rares, god pack, comic parallels, gold DON!! cards. PRB sets are never reprinted — note this.",
    ultradeck: "This is an Ultra Deck (ST). These have exclusive SP cards. Focus on any SP/promo exclusive to this product that has collectible value.",
    starterex: "This is a Starter Deck EX. These have exclusive anniversary/special SP cards. Focus on any high-value exclusives.",
    starter:   "This is a Starter Deck (ST). These rarely have high individual card value. Find any SP or exclusive alt art cards worth noting.",
    crossover: "This is a crossover product. Find all cards and their collectible value.",
    tinset:    "This is a tin/special pack set. Find any exclusive promo cards included and their value.",
    unknown:   "Research this set and find all collectible cards of value.",
  }[setType] || "Research this set thoroughly.";

  return `You are a One Piece TCG English market expert. Research the set ${setCode} and return structured data.

Context: ${typeContext}

Search opcardlist.com and tcgplayer.com to find current EN data for ${setCode}.

Return ONLY valid JSON — no markdown, no explanation:
{
  "set_code": "${setCode}",
  "set_id": "${setCodeToId(setCode)}",
  "set_type": "${setType}",
  "name": "Full Set Name",
  "release_date": "YYYY-MM-DD",
  "card_count": 154,
  "box_ev": "$350",
  "box_msrp": "$119.76",
  "box_ev_pct": "292% of MSRP",
  "is_new": true,
  "notes": "Brief note about what makes this set notable (e.g. never reprinted, anniversary set, etc.)",
  "top_cards": [
    {
      "rank": 1,
      "name": "Card Name",
      "variant": "Manga Alternate Art (SEC) · Card details · Last sold $X · Median $Y",
      "card_num": "XXXX-NNN",
      "rarity_badge_class": "r-sec",
      "rarity_label": "SEC MANGA",
      "price": "$1,234",
      "price_class": "high",
      "bandai_code": "XXXX-NNN_p2"
    }
  ],
  "price_targets": [
    {
      "id": "${setCodeToId(setCode)}_card_name",
      "label": "Card Name Description",
      "set": "${setCode}",
      "card": "XXXX-NNN card description"
    }
  ],
  "chase_stat": "$1,234",
  "chase_label": "Chase Card (Card Name)"
}

RARITY badge classes: r-sec (Secret Rare/Manga), r-sp (SP Gold/Silver/Special), r-sr (Super Rare), r-r (Rare), r-par (Parallel)
PRICE classes: mega (>$2000), high ($500-$2000), mid ($50-$500)
BANDAI codes: SETNUM-CARDNUM_pN (p1=base parallel, p2=manga alt, p3=red SAA, r1/r2=reprint)

For starter decks with few valuable cards, top_cards may have fewer than 10 entries.
If prices are settling (new release), note that in variants and use is_new=true.
If a card price is unavailable, use "TBD — check TCGPlayer".`;
}

  return `You are a One Piece TCG English market expert. Research the set ${setCode} and return structured data.

Search opcardlist.com/${setCode.toLowerCase().replace("-","").replace(/op(\d+).*/,"op-$1")} and related pages to find:
1. Full set name
2. English release date
3. Total card count
4. Top 10 most valuable EN cards (name, card number, rarity, current EN price using median/last sold)
5. Box EV (Expected Value) if available
6. Any special chase cards (Manga Rares, SP Gold/Silver, SAA, Demon Packs etc.)
7. Key new mechanics or notable features of the set

Return ONLY valid JSON — no markdown, no explanation:
{
  "set_code": "${setCode}",
  "set_id": "${setCodeToId(setCode)}",
  "name": "Full Set Name",
  "release_date": "YYYY-MM-DD",
  "card_count": 154,
  "box_ev": "$350",
  "box_msrp": "$119.76",
  "box_ev_pct": "292% of MSRP",
  "is_new": true,
  "notes": "Brief note about what makes this set notable",
  "top_cards": [
    {
      "rank": 1,
      "name": "Card Name",
      "variant": "Manga Alternate Art (SEC) · Card details",
      "card_num": "XXXX-NNN",
      "rarity_badge_class": "r-sec",
      "rarity_label": "SEC MANGA",
      "price": "$1,234",
      "price_class": "high",
      "bandai_code": "XXXX-NNN_p2"
    }
  ],
  "price_targets": [
    {
      "id": "${setCodeToId(setCode)}_chasecard_name",
      "label": "Card Name Description",
      "set": "${setCode}",
      "card": "XXXX-NNN card description"
    }
  ],
  "chase_stat": "$1,234",
  "chase_label": "Chase Card (Card Name)"
}

RARITY badge classes: r-sec (Secret Rare / Manga), r-sp (SP Gold/Silver/Special), r-sr (Super Rare), r-r (Rare), r-par (Parallel)
PRICE classes: mega (>$2000), high ($500-$2000), mid ($50-$500)
BANDAI codes follow pattern: SETNUM-CARDNUM_pN where pN is variant (p1=base parallel, p2=manga alt, p3=red SAA etc)

If the set has just released and prices are unsettled, note that in each price and set is_new=true.
If prices are unavailable, use "TBD — check TCGPlayer" as the price value.`;
}

// ─── HTML Generator ─────────────────────────────────────────────────────────
function generateNavButton(data, isNew = false) {
  const id      = data.set_id;
  const label   = data.set_code;
  const style   = setCodeToStyle(data.set_code);
  const newBadge = isNew ? " 🆕" : "";

  // New sets get a red border to stand out
  const newStyle = isNew
    ? 'style="border-color:#f87171;color:#f87171"'
    : style;

  return `  <button class="set-btn" onclick="showSet('${id}',this)" ${newStyle}>${label}${newBadge}</button>`;
}

function generateSetSection(data) {
  const id        = data.set_id;
  const setCode   = data.set_code;
  const name      = data.name || setCode;
  const date      = data.release_date || "TBD";
  const cards     = data.card_count || 0;
  const ev        = data.box_ev || "TBD";
  const evPct     = data.box_ev_pct || "";
  const chaseVal  = data.chase_stat || "TBD";
  const chaseLabel= data.chase_label || "Chase Card";
  const notes     = data.notes || "";
  const isNew     = data.is_new;

  // Format release date nicely
  let releaseFmt = date;
  try {
    releaseFmt = new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {}

  // Fire emoji for high EV
  let evEmoji = "";
  const evNum = parseFloat((ev || "").replace(/[^0-9.]/g, ""));
  if (evNum > 800) evEmoji = " 🔥🔥🔥";
  else if (evNum > 400) evEmoji = " 🔥🔥";
  else if (evNum > 200) evEmoji = " 🔥";

  const newWarning = isNew ? `
  <div class="footnote" style="border-color:#92400e;background:#1c0f00;margin-bottom:12px">
    ⚠️ <strong style="color:#fbbf24">${setCode} is a new release.</strong> Prices are actively settling from launch hype. Always verify on TCGPlayer before transacting. Box EV and top card rankings will stabilize 4–6 weeks post-release.
  </div>` : "";

  // Generate card rows
  const rows = (data.top_cards || []).map((card, i) => {
    const rank     = i + 1;
    const rankClass = rank <= 3 ? "top3" : "";
    const rankEmojis = { 1: "🥇", 2: "🥈", 3: "🥉" };
    const rankDisplay = rank <= 3 ? rankEmojis[rank] : rank;
    const rankStyle  = rank <= 3 ? 'style="font-size:1.3rem"' : "";

    // Thumbnail if we have a bandai code
    let thumbHtml = "";
    if (card.bandai_code) {
      const safeName = (card.name || "").replace(/"/g, "&quot;");
      const imgId = `${id}_${card.bandai_code.replace(/[^a-z0-9]/gi,"_").toLowerCase()}`;
      thumbHtml = `<img class="card-thumb" src="/images/cards/${card.bandai_code}.png" data-fallback="https://en.onepiece-cardgame.com/images/cardlist/card/${card.bandai_code}.png" alt="${safeName}" loading="lazy" data-img-id="${imgId}" data-card-name="${safeName}" onerror="this.src=this.dataset.fallback;this.removeAttribute('onerror')">`;
    }

    const nameCell = thumbHtml
      ? `<div class="card-name-cell">${thumbHtml}<div class="card-name-text"><div class="card-name">${card.name || ""}</div><div class="card-variant">${card.variant || ""}</div></div></div>`
      : `<div class="card-name">${card.name || ""}</div><div class="card-variant">${card.variant || ""}</div>`;

    const priceClass = card.price_class || "mid";
    const imgIdAttr  = card.bandai_code
      ? ` data-img-id="${id}_${card.bandai_code.replace(/[^a-z0-9]/gi,"_").toLowerCase()}" data-bandai="${card.bandai_code}"`
      : "";

    return `      <tr${imgIdAttr}><td class="rank-num ${rankClass}" ${rankStyle}>${rankDisplay}</td><td>${nameCell}</td><td class="card-num">${card.card_num || ""}</td><td><span class="rarity-badge ${card.rarity_badge_class || "r-sr"}">${card.rarity_label || "SR"}</span></td><td class="price-cell ${priceClass}">${card.price || "TBD"}</td></tr>`;
  }).join("\n");

  const footerNote = notes ? `\n  <div class="footnote" style="margin-top:12px">${notes}</div>` : "";

  return `
<!-- ${setCode} — ${name} -->
<div class="set-section" id="${id}">
  <div class="set-hero">
    <div class="set-title-block">
      <div class="set-code">${setCode}</div>
      <h2>${name}</h2>
      <div class="set-date">Released ${releaseFmt} · ${cards} cards · Box EV: ${ev}${evPct ? ` (${evPct})` : ""}${evEmoji}</div>
    </div>
    <div class="set-stats">
      <div class="stat-box"><span class="stat-val">${chaseVal}</span><span class="stat-label">${chaseLabel}</span></div>
    </div>
  </div>
  ${newWarning}
  <table class="card-table">
    <thead><tr><th>#</th><th>Card</th><th>Card #</th><th>Rarity</th><th>Price ✓</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>${footerNote}
</div>`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export async function generateSetTab(setCode, setType = "booster") {
  console.log(`[generate-set-tab] Researching ${setCode} (type: ${setType})...`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: buildResearchPrompt(setCode, setType) }],
  });

  // Extract JSON from response
  const text  = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error(`No JSON found in Claude response for ${setCode}`);
  }

  const data = JSON.parse(clean.slice(start, end + 1));

  // Generate HTML components
  const navButton  = generateNavButton(data, data.is_new);
  const sectionHtml = generateSetSection(data);

  console.log(`[generate-set-tab] ✅ Generated tab for ${setCode} — ${data.top_cards?.length || 0} cards`);

  return {
    setCode,
    setId:        data.set_id,
    data,
    navButton,
    sectionHtml,
    priceTargets: data.price_targets || [],
  };
}
