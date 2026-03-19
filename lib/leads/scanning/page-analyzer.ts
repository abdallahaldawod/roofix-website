/**
 * Server-only: DOM analysis for lead list pages. Infers suggested extraction config
 * using practical heuristics (data attributes, semantic tags, link patterns).
 * No UI; no Firestore. Used by the Analyze Page API.
 */

import type { Page } from "playwright";
import type { SourceExtractionConfig } from "@/lib/leads/types";

export type AnalyzePageDiagnostics = {
  pageTitle: string;
  pageUrl: string;
  candidateContainerCount: number;
  chosenLeadCardSelector: string;
  chosenLeadCardCount: number;
  warnings: string[];
  previewLeadCount?: number;
};

export type AnalyzePageResult = {
  suggestedConfig: SourceExtractionConfig;
  diagnostics: AnalyzePageDiagnostics;
};

/** Candidate container selectors to try (generic, source-agnostic). */
const CONTAINER_CANDIDATES = [
  "article",
  "li",
  "[data-job-id]",
  "[data-id]",
  "[data-testid]", // we'll refine by value
];

/** Lead-related path substrings for detail links. */
const LEAD_LINK_PATTERNS = ["/lead", "/job", "/details", "/listing", "/opportunit"];

function trim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * Discover data-testid values that appear 2+ times (likely card containers).
 */
async function discoverDataTestIdSelectors(page: Page): Promise<string[]> {
  const values = await page.evaluate(() => {
    const count: Record<string, number> = {};
    document.querySelectorAll("[data-testid]").forEach((el) => {
      const v = el.getAttribute("data-testid")?.trim();
      if (v) count[v] = (count[v] ?? 0) + 1;
    });
    return Object.entries(count)
      .filter(([, n]) => n >= 2)
      .map(([v]) => `[data-testid="${v}"]`);
  });
  return values;
}

/**
 * Count elements matching selector and whether first match contains a link.
 */
async function scoreCandidate(
  page: Page,
  selector: string
): Promise<{ count: number; hasLink: boolean }> {
  const count = await page.locator(selector).count().catch(() => 0);
  let hasLink = false;
  if (count > 0) {
    hasLink = await page
      .locator(selector)
      .first()
      .locator("a[href]")
      .count()
      .then((n) => n > 0)
      .catch(() => false);
  }
  return { count, hasLink };
}

/**
 * Pick the best lead-card container: prefer 2+ items, then prefer has link.
 */
async function chooseLeadCardSelector(page: Page): Promise<{
  selector: string;
  count: number;
  candidates: { selector: string; count: number }[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const candidates: { selector: string; count: number; hasLink: boolean }[] = [];

  // Fixed candidates
  for (const sel of CONTAINER_CANDIDATES) {
    if (sel === "[data-testid]") continue; // handle separately
    const { count, hasLink } = await scoreCandidate(page, sel);
    if (count >= 2) candidates.push({ selector: sel, count, hasLink });
  }

  // Discovered data-testid selectors
  const testIdSelectors = await discoverDataTestIdSelectors(page);
  for (const sel of testIdSelectors) {
    const { count, hasLink } = await scoreCandidate(page, sel);
    if (count >= 2) candidates.push({ selector: sel, count, hasLink });
  }

  // Try [class*="card"] and [class*="job"] if nothing found
  if (candidates.length === 0) {
    for (const part of ["card", "job", "item", "listing"]) {
      const sel = `[class*="${part}"]`;
      const { count, hasLink } = await scoreCandidate(page, sel);
      if (count >= 2) candidates.push({ selector: sel, count, hasLink });
    }
  }

  const candidateCount = candidates.length;
  if (candidateCount === 0) {
    return {
      selector: "",
      count: 0,
      candidates: [],
      warnings: ["No repeated container found (need at least 2 similar elements). Try connecting and opening a leads list with multiple items."],
    };
  }

  // Sort by count desc, then by hasLink
  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.hasLink ? 1 : 0) - (a.hasLink ? 1 : 0);
  });
  const best = candidates[0]!;
  if (candidateCount > 1) {
    warnings.push(`Multiple container types found; chose "${best.selector}" (${best.count} items).`);
  }
  return {
    selector: best.selector,
    count: best.count,
    candidates: candidates.map((c) => ({ selector: c.selector, count: c.count })),
    warnings,
  };
}

/**
 * Infer field selectors inside the first card using common patterns.
 */
async function inferFieldSelectors(
  page: Page,
  cardSelector: string
): Promise<Partial<SourceExtractionConfig>> {
  const card = page.locator(cardSelector).first();
  const fields: Partial<SourceExtractionConfig> = {};

  // Title: h1-h4, or first element with title-like class
  const headingSel = "h1, h2, h3, h4";
  const headingText = await card.locator(headingSel).first().textContent().catch(() => null);
  if (trim(headingText)) {
    const tag = await card.locator(headingSel).first().evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    if (tag) fields.titleSelector = tag;
  }
  if (!fields.titleSelector) {
    const found = await card.evaluate((root) => {
      const titleKeywords = ["title", "heading", "name", "job-title"];
      const nodes = root.querySelectorAll("[class], [data-testid], [aria-label]");
      for (const el of Array.from(nodes)) {
        const cl = (el.getAttribute("class") ?? "").toLowerCase();
        const testId = (el.getAttribute("data-testid") ?? "").toLowerCase();
        const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
        const text = (el.textContent ?? "").trim();
        if (text.length < 2 || text.length > 200) continue;
        for (const k of titleKeywords) {
          if (cl.includes(k) || testId.includes(k) || aria.includes(k)) {
            const sel = el.id ? `#${el.id}` : el.getAttribute("data-testid") ? `[data-testid="${el.getAttribute("data-testid")}"]` : el.className ? `.${Array.from(el.classList).find((c) => c.length > 0) ?? ""}` : el.tagName.toLowerCase();
            if (sel && sel.length > 1) return sel;
          }
        }
      }
      return null;
    });
    if (found) fields.titleSelector = found;
  }

  // Description: p or [class*="description"]
  const pText = await card.locator("p").first().textContent().catch(() => null);
  if (trim(pText)) fields.descriptionSelector = "p";
  if (!fields.descriptionSelector) {
    const descSel = await card.evaluate((root) => {
      const keywords = ["description", "desc", "body", "content", "job-desc"];
      const nodes = root.querySelectorAll("[class], [data-testid]");
      for (const el of Array.from(nodes)) {
        const cl = (el.getAttribute("class") ?? "").toLowerCase();
        const testId = (el.getAttribute("data-testid") ?? "").toLowerCase();
        const text = (el.textContent ?? "").trim();
        if (text.length < 10 || text.length > 3000) continue;
        for (const k of keywords) {
          if (cl.includes(k) || testId.includes(k)) {
            if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
            const cls = Array.from(el.classList).find((c) => c.length > 0);
            if (cls) return `.${cls}`;
          }
        }
      }
      return null;
    });
    if (descSel) fields.descriptionSelector = descSel;
  }

  // Detail link: a[href*="/lead/"] or similar (inline patterns so evaluate runs in browser without closure)
  const linkSel = await card.evaluate((root) => {
    const patterns = ["/lead", "/job", "/details", "/listing", "/opportunit"];
    const links = root.querySelectorAll("a[href]");
    for (const link of Array.from(links)) {
      const href = (link.getAttribute("href") ?? "").toLowerCase();
      if (patterns.some((p) => href.includes(p))) {
        const text = (link.textContent ?? "").trim().toLowerCase();
        if (text.length < 50) return "a[href*='/lead/'], a[href*='/job/'], a[href*='/details/']";
      }
    }
    return null;
  });
  if (linkSel) fields.detailLinkSelector = "a[href*=\"/lead/\"], a[href*=\"/job/\"], a[href*=\"/details/\"]";

  // External ID: extractor already uses data-id/data-job-id on card and detailLinkSelector href segment; no need to set here unless we find a child element with id.

  // Suburb / location
  const locSel = await card.evaluate((root) => {
    const keywords = ["location", "suburb", "address", "area", "region"];
    const nodes = root.querySelectorAll("[class], [data-testid]");
    for (const el of Array.from(nodes)) {
      const cl = (el.getAttribute("class") ?? "").toLowerCase();
      const testId = (el.getAttribute("data-testid") ?? "").toLowerCase();
      const text = (el.textContent ?? "").trim();
      if (text.length < 2 || text.length > 150) continue;
      for (const k of keywords) {
        if (cl.includes(k) || testId.includes(k)) {
          if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
          const cls = Array.from(el.classList).find((c) => c.length > 0);
          if (cls) return `.${cls}`;
        }
      }
    }
    return null;
  });
  if (locSel) fields.suburbSelector = locSel;

  // Postcode: element with 4-digit text or class*="postcode"
  const postcodeSel = await card.evaluate((root) => {
    const keywords = ["postcode", "postal", "zip"];
    const nodes = root.querySelectorAll("[class], [data-testid]");
    for (const el of Array.from(nodes)) {
      const cl = (el.getAttribute("class") ?? "").toLowerCase();
      const testId = (el.getAttribute("data-testid") ?? "").toLowerCase();
      const text = (el.textContent ?? "").trim();
      if (/\b\d{4}\b/.test(text) || keywords.some((k) => cl.includes(k) || testId.includes(k))) {
        if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
        const cls = Array.from(el.classList).find((c) => c.length > 0);
        if (cls) return `.${cls}`;
      }
    }
    return null;
  });
  if (postcodeSel) fields.postcodeSelector = postcodeSel;

  // Posted date
  const dateSel = await card.evaluate((root) => {
    const keywords = ["date", "time", "posted", "created", "updated"];
    const nodes = root.querySelectorAll("[class], [data-testid], time");
    for (const el of Array.from(nodes)) {
      const cl = (el.getAttribute("class") ?? "").toLowerCase();
      const testId = (el.getAttribute("data-testid") ?? "").toLowerCase();
      const datetime = el.getAttribute("datetime");
      if (datetime || keywords.some((k) => cl.includes(k) || testId.includes(k)) || el.tagName.toLowerCase() === "time") {
        if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
        if (el.tagName.toLowerCase() === "time") return "time";
        const cls = Array.from(el.classList).find((c) => c.length > 0);
        if (cls) return `.${cls}`;
      }
    }
    return null;
  });
  if (dateSel) fields.postedAtSelector = dateSel;

  return fields;
}

/**
 * Analyze the current page DOM and return suggested extraction config + diagnostics.
 * Page must already be loaded on the leads list URL.
 */
export async function analyzePageDom(page: Page): Promise<AnalyzePageResult> {
  const diagnostics: AnalyzePageDiagnostics = {
    pageTitle: await page.title().catch(() => ""),
    pageUrl: page.url(),
    candidateContainerCount: 0,
    chosenLeadCardSelector: "",
    chosenLeadCardCount: 0,
    warnings: [],
  };

  const { selector, count, candidates, warnings } = await chooseLeadCardSelector(page);
  diagnostics.candidateContainerCount = candidates.length;
  diagnostics.chosenLeadCardSelector = selector;
  diagnostics.chosenLeadCardCount = count;
  diagnostics.warnings = warnings;

  if (!selector) {
    return {
      suggestedConfig: { leadCardSelector: "" },
      diagnostics,
    };
  }

  const inferred = await inferFieldSelectors(page, selector);
  const suggestedConfig: SourceExtractionConfig = {
    leadCardSelector: selector,
    ...(inferred.titleSelector && { titleSelector: inferred.titleSelector }),
    ...(inferred.descriptionSelector && { descriptionSelector: inferred.descriptionSelector }),
    ...(inferred.suburbSelector && { suburbSelector: inferred.suburbSelector }),
    ...(inferred.postcodeSelector && { postcodeSelector: inferred.postcodeSelector }),
    ...(inferred.externalIdSelector && { externalIdSelector: inferred.externalIdSelector }),
    ...(inferred.externalIdAttribute && { externalIdAttribute: inferred.externalIdAttribute }),
    ...(inferred.detailLinkSelector && { detailLinkSelector: inferred.detailLinkSelector }),
    ...(inferred.postedAtSelector && { postedAtSelector: inferred.postedAtSelector }),
  };

  if (count < 2) diagnostics.warnings.push("Only one card found; selectors may need manual tuning.");
  return { suggestedConfig, diagnostics };
}
