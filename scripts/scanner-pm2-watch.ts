/**
 * Keeps PM2 status in sync with Firestore: when no external source is Active +
 * configured for scanning, pauses the scanner app so `pm2 list` shows "paused"
 * (PM2 5+). When at least one source is scannable, resumes the scanner.
 *
 * Run alongside the scanner, e.g. second PM2 app:
 *   SCANNER_PM2_APP_NAME=roofix-scanner npm run scanner-pm2-watch
 *
 * Or: pm2 start ecosystem.config.cjs
 *
 * Requires same .env.local / Firebase Admin as scanner-worker.
 */

import path from "path";
import dotenv from "dotenv";
import { execFile } from "child_process";
import { promisify } from "util";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { getSourcesAdmin } from "../lib/leads/sources-admin";
import { getScannableSources } from "../lib/leads/scanner-eligibility";

const execFileAsync = promisify(execFile);

const POLL_MS = Number(process.env.SCANNER_PM2_WATCH_POLL_MS ?? "5000");
const APP = process.env.SCANNER_PM2_APP_NAME?.trim() ?? "";
const PREFIX = "[scanner-pm2-watch]";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pm2PauseOrStop(): Promise<void> {
  try {
    await execFileAsync("pm2", ["pause", APP], { timeout: 20_000 });
    console.log(`${PREFIX} pm2 pause ${APP} (status should show paused in PM2 5+)`);
    return;
  } catch {
    // Older PM2: no `pause` command
  }
  try {
    await execFileAsync("pm2", ["stop", APP], { timeout: 20_000 });
    console.log(`${PREFIX} pm2 stop ${APP} (fallback — status: stopped)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${PREFIX} pause/stop failed | ${msg.replace(/\|/g, ";")}`);
  }
}

async function pm2ResumeOrStart(): Promise<void> {
  try {
    await execFileAsync("pm2", ["resume", APP], { timeout: 20_000 });
    console.log(`${PREFIX} pm2 resume ${APP}`);
    return;
  } catch {
    // Older PM2 or was stopped
  }
  try {
    await execFileAsync("pm2", ["start", APP], { timeout: 20_000 });
    console.log(`${PREFIX} pm2 start ${APP} (fallback)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${PREFIX} resume/start failed | ${msg.replace(/\|/g, ";")}`);
  }
}

async function main(): Promise<void> {
  if (!APP) {
    console.error(
      `${PREFIX} Set SCANNER_PM2_APP_NAME to your PM2 app name (e.g. roofix-scanner), then restart this watch process.`
    );
    process.exit(1);
  }

  console.log(`${PREFIX} watching Firestore every ${POLL_MS}ms | target_pm2_app=${APP}`);

  let lastPaused: boolean | null = null;

  for (;;) {
    try {
      const sources = await getSourcesAdmin();
      const scannable = getScannableSources(sources);
      const shouldPause = scannable.length === 0;

      if (lastPaused === null) {
        if (shouldPause) {
          await pm2PauseOrStop();
        }
        lastPaused = shouldPause;
      } else if (shouldPause !== lastPaused) {
        if (shouldPause) {
          await pm2PauseOrStop();
        } else {
          await pm2ResumeOrStart();
        }
        lastPaused = shouldPause;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${PREFIX} poll_error | ${msg.replace(/\|/g, ";")}`);
    }

    await sleep(POLL_MS);
  }
}

main();
