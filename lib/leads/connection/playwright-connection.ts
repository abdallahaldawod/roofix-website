/**
 * Server-only: generic manual connection flow using a visible Playwright browser.
 * Opens Login URL, waits until the user navigates to the Leads URL, then saves session state.
 * Source-agnostic; no platform-specific selectors or logic.
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type RunManualConnectionOptions = {
  loginUrl: string;
  leadsUrl: string;
  /** Primary Playwright storage state file (e.g. leads session). */
  storageStatePath: string;
  /** Additional paths to write the same session (e.g. jobs session file). */
  extraStorageStatePaths?: string[];
  timeoutMs?: number;
};

export type RunManualConnectionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Normalize pathname for comparison (no trailing slash, except for root).
 */
function normalizePathname(pathname: string): string {
  const p = pathname || "/";
  return p === "/" ? "/" : p.replace(/\/+$/, "") || "/";
}

/**
 * Returns true when the current URL has "reached" the leads URL:
 * same origin and pathname equals or is a subpath of the leads pathname.
 */
function urlReachesLeads(currentUrl: URL, leadsUrl: string): boolean {
  let target: URL;
  try {
    target = new URL(leadsUrl);
  } catch {
    return false;
  }
  if (currentUrl.origin !== target.origin) return false;
  const currentPath = normalizePathname(currentUrl.pathname);
  const targetPath = normalizePathname(target.pathname);
  if (currentPath === targetPath) return true;
  if (targetPath === "/") return true;
  return currentPath.startsWith(targetPath + "/");
}

/**
 * Runs the manual connection flow: launches a visible browser, opens loginUrl,
 * waits until the page URL reaches leadsUrl (or timeout/browser closed), then
 * saves storage state to storageStatePath (and optional extra paths) and closes the browser.
 */
export async function runManualConnection(
  options: RunManualConnectionOptions
): Promise<RunManualConnectionResult> {
  const {
    loginUrl,
    leadsUrl,
    storageStatePath,
    extraStorageStatePaths = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  if (!loginUrl?.trim() || !leadsUrl?.trim()) {
    return { ok: false, error: "Login URL and Leads URL are required." };
  }

  try {
    new URL(loginUrl);
  } catch {
    return { ok: false, error: "Invalid Login URL." };
  }
  try {
    new URL(leadsUrl);
  } catch {
    return { ok: false, error: "Invalid Leads URL." };
  }

  mkdirSync(dirname(storageStatePath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    await browser.close();
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to open login page.",
    };
  }

  const reachedPromise = page
    .waitForURL(
      (url) => urlReachesLeads(url, leadsUrl),
      { timeout: timeoutMs }
    )
    .then(() => "reached" as const)
    .catch(() => "timeout" as const);

  const closedPromise = new Promise<"closed">((resolve) => {
    page.on("close", () => resolve("closed"));
    context.on("close", () => resolve("closed"));
  });

  const result = await Promise.race([reachedPromise, closedPromise]);

  if (result === "closed") {
    try {
      await browser.close();
    } catch {
      // already closed
    }
    return {
      ok: false,
      error: "Browser was closed before reaching the leads page.",
    };
  }

  if (result === "timeout") {
    try {
      await browser.close();
    } catch {
      //
    }
    return {
      ok: false,
      error: "Connection timed out. Please try again.",
    };
  }

  // result === "reached"
  const allPaths = [storageStatePath, ...extraStorageStatePaths.map((p) => p.trim()).filter(Boolean)];
  try {
    for (const path of allPaths) {
      await context.storageState({ path });
    }
  } catch (e) {
    try {
      await browser.close();
    } catch {
      //
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save session state.",
    };
  }

  await browser.close();
  return { ok: true };
}
