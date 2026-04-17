/**
 * Netlify Scheduled Function: refresh-prices
 * Runs daily at 6am UTC via cron: "0 6 * * *"
 *
 * Fetches current One Piece TCG EN prices using Claude + web search,
 * writes the result to public/prices.json so the site reads fresh data on load.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── CARDS TO TRACK ──────────────────────────────────────────────────────────
// Add or remove cards here. label = human name, set = set code, card = card number/variant.
const PRICE_TARGETS = [
  // OP-01
  { id: "op01_luffy_leader",  label: "Monkey D. Luffy Leader Parallel",    set: "OP-01", card: "OP01-002 parallel foil" },
  { id: "op01_shanks_manga",  label: "Shanks Manga SEC",                   set: "OP-01", card: "OP01-120 manga alternate art" },
  // OP-05
  { id: "op05_luffy_goldsig", label: "Luffy Gold Signature SP",            set: "OP-05", card: "OP05-119 gold stamped signature SP" },
  { id: "op05_law_manga",     label: "Trafalgar Law Manga",                set: "OP-05", card: "OP05-069 manga alternate art" },
  { id: "op05_kid_manga",     label: 'Eustass Kid Manga',                  set: "OP-05", card: "OP05-074 manga alternate art" },
  // OP-07
  { id: "op07_hancock_manga", label: "Boa Hancock Manga",                  set: "OP-07", card: "OP07-051 manga alternate art SEC" },
  // OP-08
  { id: "op08_rayleigh",      label: "Silvers Rayleigh Manga",             set: "OP-08", card: "OP08-118 manga alternate art" },
  // OP-09
  { id: "op09_roger_manga",   label: "Gol D. Roger Gold Manga",            set: "OP-09", card: "OP09-118 gold manga alternate art" },
  { id: "op09_luffy_manga",   label: "Monkey D. Luffy Manga",              set: "OP-09", card: "OP09-119 manga alternate art" },
  { id: "op09_shanks_gold",   label: "Shanks SP Gold",                    set: "OP-09", card: "OP09-004 SP gold parallel" },
  // OP-10
  { id: "op10_law_manga",     label: "Trafalgar Law Manga",                set: "OP-10", card: "OP10-119 manga alternate art" },
  // OP-11
  { id: "op11_luffy_gold",    label: "Luffy 3rd Anniv SP Gold",            set: "OP-11", card: "OP05-119 3rd anniversary SP gold" },
  { id: "op11_luffy_silver",  label: "Luffy 3rd Anniv SP Silver",          set: "OP-11", card: "OP05-119 3rd anniversary SP silver" },
  { id: "op11_luffy_manga",   label: "Luffy Snakeman Manga",               set: "OP-11", card: "OP11-118 manga alternate art" },
  // OP-12
  { id: "op12_teach_silver",  label: "Marshall D. Teach SP Silver",        set: "OP-12", card: "OP09-093 3rd anniversary SP silver" },
  { id: "op12_bonney_manga",  label: "Jewelry Bonney Manga",               set: "OP-12", card: "OP12-118 manga alternate art" },
  // OP-13
  { id: "op13_luffy_redsaa",  label: "Luffy Red Super Alt Art",            set: "OP-13", card: "OP13-118 red super alternate art SEC" },
  { id: "op13_sabo_redsaa",   label: "Sabo Red Super Alt Art",             set: "OP-13", card: "OP13-120 red super alternate art SEC" },
  { id: "op13_ace_redsaa",    label: "Ace Red Super Alt Art",              set: "OP-13", card: "OP13-119 red super alternate art SEC" },
  { id: "op13_shanks_gold",   label: "Shanks SP Gold",                    set: "OP-13", card: "OP09-004 P5 SP gold (in OP-13)" },
  // OP-14
  { id: "op14_buggy_gold",    label: "Buggy SP Gold Anniversary",          set: "OP-14", card: "OP09-051 SP gold anniversary" },
  { id: "op14_mihawk_manga",  label: "Dracule Mihawk Manga",               set: "OP-14", card: "OP14-119 manga alternate art" },
  { id: "op14_buggy_silver",  label: "Buggy SP Silver Anniversary",        set: "OP-14", card: "OP09-051 SP silver anniversary" },
  // OP-15
  { id: "op15_enel_manga",    label: "Enel Manga",                         set: "OP-15", card: "OP15-118 manga alternate art SEC" },
  // EB-01
  { id: "eb01_chopper_manga", label: "Tony Tony Chopper Manga",            set: "EB-01", card: "EB01-006 manga alternate art" },
  // EB-02
  { id: "eb02_luffy_sp",      label: "Luffy SP Leader",                   set: "EB-02", card: "OP05-060 SP leader parallel" },
  { id: "eb02_luffy_manga",   label: "Luffy Manga (Gear 2)",               set: "EB-02", card: "EB02-061 manga alternate art" },
  // EB-03
  { id: "eb03_nami_sp",       label: "Nami SP Manga",                     set: "EB-03", card: "EB03-053 SP manga alternate art" },
  { id: "eb03_uta_manga",     label: "Uta Manga",                         set: "EB-03", card: "EB03-061 manga alternate art" },
  { id: "eb03_robin_sp",      label: "Nico Robin SP Manga",               set: "EB-03", card: "EB03-055 SP manga alternate art" },
  { id: "eb03_hancock_sp",    label: "Boa Hancock SP Manga",              set: "EB-03", card: "EB03-026 SP manga alternate art" },
  // PRB-01
  { id: "prb01_luffy",        label: "Luffy Comic Parallel",              set: "PRB-01", card: "OP05-119 comic parallel" },
  { id: "prb01_chopper",      label: "Chopper Comic Parallel",            set: "PRB-01", card: "EB01-006 comic parallel" },
  { id: "prb01_nami",         label: "Nami Comic Parallel",               set: "PRB-01", card: "OP01-016 comic parallel" },
  // PRB-02
  { id: "prb02_sanji_manga",  label: "Vinsmoke Sanji Manga",              set: "PRB-02", card: "OP06-119 manga alternate art" },
];

// ─── BUILD PROMPT ────────────────────────────────────────────────────────────
function buildPrompt() {
  const cardList = PRICE_TARGETS.map((t, i) =>
    `${i + 1}. [${t.id}] ${t.label} — ${t.set} · ${t.card}`
  ).join("\n");

  return `You are a One Piece TCG English market price expert. Search opcardlist.com and tcgplayer.com for current raw Near Mint ungraded English prices for these cards.

For each card:
- Check opcardlist.com first (search opcardlist.com/[set-code] e.g. opcardlist.com/op-13)
- Use the MEDIAN price or LAST SOLD price, NOT the market price (market price is often distorted)
- If the card has a price range, use the midpoint
- English edition only

Cards to price:
${cardList}

Return ONLY valid JSON — no markdown fences, no explanation. Use this exact format:
{
  "fetched_at": "${new Date().toISOString()}",
  "prices": [
    {"id": "op01_luffy_leader", "price": "$1,649", "source": "opcardlist median", "trend": "stable"},
    {"id": "op01_shanks_manga", "price": "$1,250", "source": "last sold", "trend": "up"}
  ]
}

trend must be one of: "up", "down", "stable", "new" (for OP-15 cards still settling)
If a price is genuinely unavailable, use "price": null and "source": "unavailable"`;
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
export default async function handler() {
  console.log(`[refresh-prices] Starting at ${new Date().toISOString()}`);

  try {
    // Call Claude with web search enabled
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: buildPrompt() }],
    });

    // Extract text blocks (Claude may also return tool_use blocks for searches)
    const textBlocks = response.content.filter((b) => b.type === "text");
    const fullText = textBlocks.map((b) => b.text).join("");

    // Parse JSON — strip any accidental markdown fences
    const clean = fullText.replace(/```json|```/g, "").trim();
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON object found in Claude response");
    }

    const priceData = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));

    // Validate structure
    if (!priceData.prices || !Array.isArray(priceData.prices)) {
      throw new Error("Invalid price data structure from Claude");
    }

    // Add metadata
    priceData.generated_at = new Date().toISOString();
    priceData.card_count = priceData.prices.length;
    priceData.success = true;

    // Write to public/prices.json — this is served statically
    const outputPath = path.join(process.cwd(), "public", "prices.json");
    fs.writeFileSync(outputPath, JSON.stringify(priceData, null, 2));

    console.log(
      `[refresh-prices] ✅ Success — ${priceData.prices.length} prices written to prices.json`
    );

    return new Response(
      JSON.stringify({ ok: true, count: priceData.prices.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(`[refresh-prices] ❌ Error: ${err.message}`);

    // Write an error state to prices.json so the site can show a warning
    const errorData = {
      success: false,
      generated_at: new Date().toISOString(),
      error: err.message,
      prices: [],
    };

    try {
      const outputPath = path.join(process.cwd(), "public", "prices.json");
      fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));
    } catch (writeErr) {
      console.error(`[refresh-prices] Also failed to write error state: ${writeErr.message}`);
    }

    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const config = {
  schedule: "0 6 * * *",
};
