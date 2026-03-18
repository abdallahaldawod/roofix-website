/**
 * Local auth bootstrap for hipages scan.
 * Launches a headed browser, opens the login page; you log in manually.
 * After login is detected, saves Playwright storage state to a file for reuse by the scan runner.
 *
 * Usage: npx tsx scripts/bootstrap-hipages-auth.ts
 *        npm run bootstrap-hipages-auth
 *
 * Env vars (optional):
 *   HIPAGES_STORAGE_STATE_PATH  Path where state is saved (and reused by run-lead-scan). Default: .auth/hipages-storage-state.json
 *   SCAN_STORAGE_STATE_PATH     Alternative to above; same effect for both bootstrap and scan when set.
 * Relative paths are resolved from process.cwd().
 *
 * Then run scans with the same path, e.g.:
 *   HIPAGES_STORAGE_STATE_PATH=.auth/hipages-storage-state.json npm run lead-scan -- <sourceId>
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";

const HIPAGES_BASE = "https://www.hipages.com.au";
const LOGIN_URL = `${HIPAGES_BASE}/login`;
const DEFAULT_STATE_PATH = resolve(process.cwd(), ".auth", "hipages-storage-state.json");

function getStatePath(): string {
  const raw =
    process.env.HIPAGES_STORAGE_STATE_PATH?.trim() ??
    process.env.SCAN_STORAGE_STATE_PATH?.trim();
  if (!raw) return DEFAULT_STATE_PATH;
  return resolve(process.cwd(), raw);
}

// URL pattern that appears after successful login (update if hipages DOM changes)
const POST_LOGIN_URL_PATTERN = /tradie|dashboard|jobs|leads|account|profile/i;
const POST_LOGIN_WAIT_MS = 120_000;

async function main() {
  const statePath = getStatePath();
  mkdirSync(dirname(statePath), { recursive: true });

  console.log("[hipages auth] --- Local hipages auth bootstrap ---");
  console.log("[hipages auth] Step 1: Opening browser (headed).");
  console.log("[hipages auth] Step 2: Log in manually on the hipages login page.");
  console.log("[hipages auth] Step 3: State will be saved automatically when login is detected.");
  console.log("");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  console.log("[hipages auth] Waiting for post-login URL (e.g. /tradie/, /dashboard/)... Max", POST_LOGIN_WAIT_MS / 1000, "seconds.");

  try {
    await page.waitForURL(POST_LOGIN_URL_PATTERN, { timeout: POST_LOGIN_WAIT_MS });
  } catch (e) {
    await browser.close();
    console.error("[hipages auth] Timeout waiting for post-login URL. Make sure you completed login.");
    process.exit(1);
  }

  await context.storageState({ path: statePath });
  await browser.close();

  console.log("[hipages auth] Saved storage state to:", statePath);
  console.log("");
  console.log("[hipages auth] --- Next steps ---");
  const relativePath = statePath.startsWith(process.cwd())
    ? statePath.slice(process.cwd().length).replace(/^\//, "") || ".auth/hipages-storage-state.json"
    : statePath;
  console.log("[hipages auth] Run a scan with the same path:");
  console.log(`  HIPAGES_STORAGE_STATE_PATH=${relativePath} npm run lead-scan -- <sourceId>`);
  console.log("[hipages auth] Example (if using default path):");
  console.log("  HIPAGES_STORAGE_STATE_PATH=.auth/hipages-storage-state.json npm run lead-scan -- <your-source-id>");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
