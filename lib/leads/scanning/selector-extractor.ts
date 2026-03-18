/**
 * Generic CSS-selector-based lead extraction from a Playwright page.
 * No Firestore; used by background-scan-runner when source has extractionConfig.
 */

import type { Page } from "playwright";
import type { SourceExtractionConfig, LastScanDebug } from "@/lib/leads/types";
import type { RawExtractedLead } from "./adapter-types";
import { logScan } from "./scan-logger";

const SNIPPET_MAX_LEN = 1500;

function trimText(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * Extract text from a child of cardLocator using selector, or return "".
 */
async function textFromSelector(
  cardLocator: ReturnType<Page["locator"]>,
  selector: string | undefined
): Promise<string> {
  if (!selector?.trim()) return "";
  try {
    const el = cardLocator.locator(selector).first();
    const text = await el.textContent({ timeout: 2000 }).catch(() => null);
    return trimText(text);
  } catch {
    return "";
  }
}

/**
 * Extract attribute from a child of cardLocator using selector and attribute name.
 */
async function attrFromSelector(
  cardLocator: ReturnType<Page["locator"]>,
  selector: string,
  attribute: string
): Promise<string> {
  try {
    const el = cardLocator.locator(selector).first();
    const value = await el.getAttribute(attribute, { timeout: 2000 }).catch(() => null);
    return trimText(value ?? "");
  } catch {
    return "";
  }
}

/**
 * Get last non-empty path segment from a URL path.
 */
function lastPathSegment(href: string): string {
  const path = href.split("?")[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = trimText(segments[i]);
    if (s) return s;
  }
  return "";
}

/**
 * Extract externalId for a card: externalIdSelector (text or attribute), else detailLinkSelector href segment, else data-id/data-job-id on card.
 */
async function extractExternalId(
  cardLocator: ReturnType<Page["locator"]>,
  config: SourceExtractionConfig
): Promise<string> {
  if (config.externalIdSelector?.trim()) {
    const el = cardLocator.locator(config.externalIdSelector).first();
    if (config.externalIdAttribute?.trim()) {
      const value = await el.getAttribute(config.externalIdAttribute.trim(), { timeout: 2000 }).catch(() => null);
      if (value != null && trimText(value)) return trimText(value);
    }
    const text = await el.textContent({ timeout: 2000 }).catch(() => null);
    if (text != null && trimText(text)) return trimText(text);
  }
  if (config.detailLinkSelector?.trim()) {
    const href = await attrFromSelector(cardLocator, config.detailLinkSelector, "href");
    if (href) {
      const segment = lastPathSegment(href);
      if (segment) return segment;
    }
  }
  try {
    const id =
      (await cardLocator.getAttribute("data-id", { timeout: 500 }).catch(() => null)) ??
      (await cardLocator.getAttribute("data-job-id", { timeout: 500 }).catch(() => null));
    if (id != null && trimText(id)) return trimText(id);
  } catch {
    //
  }
  return "";
}

/**
 * If postcode is empty, try to find a 4-digit word in suburb text.
 */
function postcodeFromSuburbIfNeeded(postcode: string, suburb: string): string {
  if (postcode.trim()) return postcode.trim();
  const match = suburb.match(/\b(\d{4})\b/);
  return match ? match[1]! : "";
}

export type ExtractLeadsOptions = {
  /** When true, capture first-card HTML snippet for debugging (truncated). */
  captureSnippet?: boolean;
};

/**
 * Extract leads from the current page using the source's extraction config.
 * Returns extracted leads, failed count, and debug info (page URL, title, card count, optional snippet).
 */
export async function extractLeadsFromPage(
  page: Page,
  config: SourceExtractionConfig,
  options: ExtractLeadsOptions = {}
): Promise<{
  leads: RawExtractedLead[];
  failedCount: number;
  debug: LastScanDebug;
}> {
  const { captureSnippet = false } = options;
  const leads: RawExtractedLead[] = [];
  let failedCount = 0;
  const selector = config.leadCardSelector?.trim();

  const debug: LastScanDebug = {};
  try {
    debug.pageUrl = page.url();
    debug.pageTitle = await page.title().catch(() => "");
  } catch {
    //
  }

  if (!selector) {
    logScan("extraction_done", {
      selector: "(none)",
      cardsFound: 0,
      extracted: 0,
      failed: 0,
    });
    return { leads, failedCount, debug };
  }

  logScan("extraction_start", { selector });

  const cards = await page.locator(selector).all();
  const totalCards = cards.length;
  debug.leadCardCount = totalCards;

  if (captureSnippet && totalCards > 0) {
    try {
      const first = cards[0]!;
      const html = await first.evaluate((el) => (el as HTMLElement).outerHTML).catch(() => "");
      debug.snippet = html.length > SNIPPET_MAX_LEN ? html.slice(0, SNIPPET_MAX_LEN) + "…" : html;
    } catch {
      //
    }
  }

  for (let i = 0; i < cards.length; i++) {
    const cardLocator = cards[i]!;
    try {
      const title = await textFromSelector(cardLocator, config.titleSelector);
      const description = await textFromSelector(cardLocator, config.descriptionSelector);
      const suburb = await textFromSelector(cardLocator, config.suburbSelector);
      let postcode = await textFromSelector(cardLocator, config.postcodeSelector);
      postcode = postcodeFromSuburbIfNeeded(postcode, suburb);
      const externalId = await extractExternalId(cardLocator, config);

      leads.push({
        externalId: externalId || undefined,
        title,
        description,
        suburb,
        postcode: postcode || undefined,
        raw: {},
      });
    } catch (err) {
      failedCount++;
      logScan("extraction_card_failed", {
        cardIndex: i,
        selector,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logScan("extraction_done", {
    selector,
    cardsFound: totalCards,
    extracted: leads.length,
    failed: failedCount,
  });

  return { leads, failedCount, debug };
}
