/**
 * Server-only: fetch hipages credit from the business leads page using a connected source's session.
 */

import { chromium } from "playwright";
import { getSourcesAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";

const HIPAGES_CREDIT_URL = "https://business.hipages.com.au/leads";
const NAVIGATION_TIMEOUT_MS = 25_000;
const CREDIT_SELECTOR_TIMEOUT_MS = 10_000;

/** Selectors for the credit element (first div in the header row under main > section). */
const CREDIT_SELECTORS = [
  "main section div[class*='justify-between'][class*='border'] > div",
  "main section div.flex.flex-row.items-center.justify-between > div",
  "main section div[class*='py-ml'] > div",
  "[class*='border-b-border-muted'] > div",
];

export type FetchHipagesCreditResult =
  | { ok: true; credit: string }
  | { ok: false; error: string };

/**
 * Load the business hipages leads page with a connected source's session and extract the credit text.
 * Uses the first connected source whose name or leadsUrl contains "hipages".
 */
export async function fetchHipagesCredit(): Promise<FetchHipagesCreditResult> {
  const sources = await getSourcesAdmin();
  const hipagesSource = sources.find(
    (s) =>
      !s.isSystem &&
      s.authStatus === "connected" &&
      (s.storageStatePath?.trim() ?? "") !== "" &&
      (s.name.toLowerCase().includes("hipages") || s.leadsUrl?.toLowerCase().includes("hipages"))
  );

  if (!hipagesSource?.storageStatePath?.trim()) {
    return { ok: false, error: "No connected hipages source. Connect a hipages source first." };
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStorageStatePath(hipagesSource.storageStatePath.trim());
  } catch {
    return { ok: false, error: "Invalid session path for hipages source." };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Browser launch failed: ${err}` };
  }

  try {
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    await page.goto(HIPAGES_CREDIT_URL, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => {});

    let credit = "";
    for (const sel of CREDIT_SELECTORS) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ state: "visible", timeout: CREDIT_SELECTOR_TIMEOUT_MS });
        const text = await el.textContent();
        credit = (text ?? "").trim();
        if (credit) break;
      } catch {
        continue;
      }
    }

    await browser.close();

    if (!credit) {
      return {
        ok: false,
        error: "Could not find credit element on the page. The page layout may have changed.",
      };
    }

    return { ok: true, credit };
  } catch (e) {
    await browser.close().catch(() => {});
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}
