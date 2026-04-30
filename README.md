# Fulcrum Cards — One Piece TCG Price Guide

## Structure
```
public/
  index.html            — Main price guide (per-set top-10, box prices, case ROI, grading)
  tournament-guide.html — Tournament prize card reference

netlify/functions/
  card-img.mjs          — Serves card images from Netlify Blobs (/card-img/:code)
  warm-card-images.mjs  — Pre-downloads all card images into Blobs (run once + weekly)
  prices.mjs            — Serves live card prices from Blobs (/api/prices)
  update-prices.mjs     — Fetches daily prices from OPCardlist → Blobs (daily 6 AM UTC)
```

## Deploy
1. Deploy this folder to Netlify (drag-and-drop on netlify.com/drop)
2. In Functions tab → invoke `warm-card-images` once to pre-cache all card images
3. In Functions tab → invoke `update-prices` once to fetch initial price data

## Version
v10.10 — April 2026
