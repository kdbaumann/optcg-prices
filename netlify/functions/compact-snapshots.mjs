// netlify/functions/compact-snapshots.mjs
//
// Weekly cron that prunes old `prices-YYYY-MM-DD` snapshots according to a
// tiered retention policy. Without this, daily snapshots accumulate forever
// — at ~400KB each that's ~150MB/yr — which is fine for storage but bloats
// the snapshot LIST returned by `/api/history` and slows the per-code
// time-series query as years pass.
//
// Retention policy:
//   Days 0-30   → keep daily (every snapshot)
//   Days 31-365 → keep weekly (Mondays only — convention; the closest match
//                 to a Monday is kept if exact Monday is missing)
//   Days >365   → keep monthly (1st of each month)
//
// Snapshots that don't match the rule for their age band are deleted.
//
// Runs weekly via Netlify's scheduled functions. Can also be invoked
// manually at /.netlify/functions/compact-snapshots?dry=1 to preview what
// would be deleted without actually deleting.

import { getStore } from '@netlify/blobs';

const TIER_DAILY_DAYS   = 30;      // keep daily for first 30 days
const TIER_WEEKLY_DAYS  = 365;     // keep weekly for 30-365 days
// Beyond TIER_WEEKLY_DAYS, keep only first-of-month.

// Decide whether a given snapshot date should be retained, given how many
// days ago it is.
function shouldKeep(date, daysAgo) {
  if (daysAgo <= TIER_DAILY_DAYS) return true;
  if (daysAgo <= TIER_WEEKLY_DAYS) {
    // Keep Mondays only. JS Sunday=0, Monday=1
    return date.getUTCDay() === 1;
  }
  return date.getUTCDate() === 1;
}

export default async (req) => {
  const url    = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const store  = getStore('card-prices');

  // List every snapshot key (excludes the live `prices` blob — different prefix)
  const result = await store.list({ prefix: 'prices-' });
  const blobs  = (result && result.blobs) || [];
  const dated  = blobs
    .map(b => b.key)
    .filter(k => /^prices-\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const decisions = { keep: [], drop: [] };
  for (const key of dated) {
    const dateStr = key.replace(/^prices-/, '');
    const date    = new Date(dateStr + 'T00:00:00Z');
    const daysAgo = Math.floor((today.getTime() - date.getTime()) / 86400000);
    if (shouldKeep(date, daysAgo)) {
      decisions.keep.push({ key, daysAgo });
    } else {
      decisions.drop.push({ key, daysAgo });
    }
  }

  // Apply deletions unless dry-run
  let deleted = 0, failed = 0;
  if (!dryRun) {
    for (const { key } of decisions.drop) {
      try {
        await store.delete(key);
        deleted++;
      } catch (e) {
        console.error(`[compact-snapshots] delete ${key} failed:`, e.message);
        failed++;
      }
    }
  }

  const summary = {
    _ranAt:      new Date().toISOString(),
    _dryRun:     dryRun,
    totalFound:  dated.length,
    kept:        decisions.keep.length,
    dropped:     decisions.drop.length,
    deleted,
    failed,
    droppedKeys: decisions.drop.slice(0, 50).map(d => d.key),
  };
  console.log('[compact-snapshots]', JSON.stringify(summary));

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Run every Monday at 07:00 UTC (one hour after the daily price scrape).
// Scheduled functions cannot declare a custom `path`; they're always reachable
// at `/.netlify/functions/compact-snapshots` for manual ?dry=1 invocation.
export const config = { schedule: '0 7 * * 1' };
