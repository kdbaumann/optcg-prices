/**
 * Netlify Scheduled Function: sync-images
 * Runs every Sunday at 4am UTC via cron: "0 4 * * 0"
 *
 * Calls the download-all-images script in smart-cache mode:
 *   - Skips images downloaded within the last 7 days
 *   - Always downloads new sets detected on OPCardlist
 *   - Checks for new OP/EB/PRB sets and logs them for manual action
 */

import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "..", "scripts", "download-all-images.mjs");

export default async function handler() {
  console.log(`[sync-images] Starting weekly image sync at ${new Date().toISOString()}`);

  return new Promise((resolve) => {
    execFile(
      process.execPath,   // node binary
      [scriptPath],       // run the download script in smart-cache mode (default)
      {
        cwd: path.join(__dirname, "..", ".."),
        timeout: 25 * 60 * 1000, // 25 minute max (Netlify function limit is 26min)
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (stdout) console.log("[sync-images] Output:\n", stdout.slice(-3000)); // last 3000 chars
        if (stderr) console.warn("[sync-images] Stderr:\n", stderr.slice(-1000));

        if (error) {
          console.error(`[sync-images] ❌ Script failed: ${error.message}`);
          resolve(new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          ));
        } else {
          // Extract summary from output
          const newSetsMatch = stdout.match(/NEW SETS DETECTED[^\n]*([\s\S]*?)(?=STEP|═)/);
          const totalMatch   = stdout.match(/Total avail: ([\d,]+) images/);
          const dlMatch      = stdout.match(/Downloaded\s*:\s*(\d+)/);

          console.log(`[sync-images] ✅ Complete — ${totalMatch?.[1] || "?"} images available, ${dlMatch?.[1] || "0"} new downloads`);

          resolve(new Response(
            JSON.stringify({
              ok: true,
              total_images: totalMatch?.[1],
              new_downloads: dlMatch?.[1],
              new_sets_detected: !!newSetsMatch,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ));
        }
      }
    );
  });
}

export const config = {
  schedule: "0 4 * * 0",  // Every Sunday at 4am UTC
};
