# One Piece TCG Price Guide

Auto-updating One Piece TCG English price guide. Prices refresh daily via a Netlify scheduled function powered by Claude AI.

## How It Works

```
Daily at 6am UTC
      │
      ▼
Netlify Scheduled Function (netlify/functions/refresh-prices.mjs)
      │
      ├─ Calls Claude claude-sonnet-4-20250514 with web_search tool
      ├─ Claude searches opcardlist.com for current EN prices
      ├─ Writes updated prices to public/prices.json
      │
      ▼
Site visitors load index.html
      │
      └─ JavaScript fetches /prices.json on page load
         └─ Patches live prices into the price table cells
```

## Project Structure

```
optcg-site/
├── netlify.toml                          # Netlify config + cron schedule
├── package.json                          # Dependencies
├── netlify/
│   └── functions/
│       └── refresh-prices.mjs            # Scheduled function (runs daily)
└── public/
    ├── index.html                        # The price guide site
    └── prices.json                       # Auto-updated price data
```

## Setup Instructions

### Step 1 — Fork / Push to GitHub
1. Create a new GitHub repo (github.com → New repository)
2. Upload all files from this folder, preserving the directory structure
3. Or use git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### Step 2 — Deploy to Netlify
1. Go to netlify.com → Add new site → Import from Git
2. Connect your GitHub account and select this repo
3. Build settings (should auto-detect from netlify.toml):
   - **Publish directory:** `public`
   - **Build command:** leave blank
4. Click **Deploy site**

### Step 3 — Add Your Anthropic API Key
1. In Netlify: Site configuration → Environment variables → Add variable
2. Key: `ANTHROPIC_API_KEY`
3. Value: your Anthropic API key (get one at console.anthropic.com)
4. Click Save, then **Trigger deploy** so the function picks it up

### Step 4 — Add Your Custom Domain (GoDaddy)
1. In Netlify: Domain management → Add a domain → enter your domain
2. In GoDaddy DNS:
   - Edit the `@` A record → set value to `75.2.60.5`
   - Add CNAME: name=`www`, value=your-netlify-subdomain.netlify.app
3. Back in Netlify → Enable HTTPS (auto via Let's Encrypt)

### Step 5 — Verify the Scheduled Function
1. In Netlify: Functions → refresh-prices → you should see it listed
2. To test manually: Functions → refresh-prices → Trigger function
3. Check that `public/prices.json` gets updated (you'll see it in the deploy log)

## Auto New Set Detection & Tab Generation

When a new set (e.g. OP-16) releases, the system handles it **fully automatically**:

```
Daily at 6am UTC
      │
      ├─ Step 1: Refresh prices for all tracked cards → prices.json
      │
      ├─ Step 2: Fetch OPCardlist homepage, scan for new set slugs
      │          Compare against KNOWN_SET_IDS in refresh-prices.mjs
      │
      └─ Step 3: For each new set found:
                 ├─ Call Claude + web_search to research the set
                 │   (top 10 cards, prices, release date, box EV, card numbers)
                 ├─ Generate HTML: nav button + full set section with card table
                 ├─ Patch index.html surgically (no existing content touched)
                 └─ Write auto-sets-state.json (tracks what was processed)
```

**What gets auto-generated:**
- Nav button in the correct position (OP sets before SPECIAL, EB/PRB in extra group)
- Full set section with top 10 cards, prices, thumbnails, rarity badges
- New entry warning banner for sets < 6 weeks old
- Version badge update with today's date and new set name

**What still requires a manual update after auto-generation:**
- Adding the set to `KNOWN_SET_IDS` in `refresh-prices.mjs` (so it's not re-detected)
- Adding the set to `ALL_SETS` in `download-all-images.mjs` (for weekly image sync)
- Reviewing and correcting card data/prices after 4-6 weeks when market settles

**State file:** `public/auto-sets-state.json` — tracks processed sets, failed attempts, and the price targets added for each new set.



Two scripts handle card images:

**`scripts/download-all-images.mjs`** — Complete downloader (used by Netlify build)
- Scrapes every set page from OPCardlist to discover all image codes automatically
- Downloads every card image: base cards, all parallels, all variants
- ~3,200+ images across all sets when complete
- Skips already-cached images on re-runs (fast incremental builds)

```bash
node scripts/download-all-images.mjs              # download everything new
node scripts/download-all-images.mjs --refresh    # re-download all
node scripts/download-all-images.mjs --sets=op-13,op-14  # specific sets only
```

**`scripts/download-images.mjs`** — Curated list of ~208 chase cards
- Manually maintained list of the most valuable cards only
- Faster to run, useful for targeted updates
- Kept as backup / reference for the specific cards the price guide tracks

**To add a new set** when it releases:
1. Add it to the `ALL_SETS` array in `download-all-images.mjs`
2. Push to GitHub — Netlify build runs the script automatically



To add or remove cards from daily tracking, edit `PRICE_TARGETS` in:
- `netlify/functions/refresh-prices.mjs` (what Claude fetches)
- `public/index.html` → `PRICE_MAP` object (which DOM cells get updated)

Both lists use the same `id` field to match cards — keep them in sync.

## Cost Estimate

- Netlify free tier: 125,000 function invocations/month → daily runs use ~30/month ✅
- Anthropic API: ~$0.05–0.15 per daily run (web search + Claude tokens) → ~$2–4/month
- Netlify hosting: free

## Manual Refresh Button

The site also has a manual "🔄 REFRESH PRICES" button in the header. Paste an Anthropic API key into the password field to use it. The key is never stored — it lives only in memory while the page is open.
