/**
 * hipages source adapter. Read-only: open site, navigate to list, extract lead data.
 * No accept, reply, or submit actions.
 *
 * Selectors are based on the real hipages tradie portal DOM structure:
 *   Lead card:    article[data-tracking-label="Lead Card"]
 *   Accept link:  a[href^="/leads/"][href$="/accept"]  → ID parsed from path
 *   Customer:     h2
 *   Posted date:  time[datetime] → datetime attribute
 *   Location/type: first and second rows of the second <section> in the card
 *   Description:  <p> inside the section whose heading includes "Job Description"
 */

import { mkdirSync } from "fs";
import { resolve } from "path";
import type { Locator } from "playwright";
import type {
  BrowserScanContext,
  AdapterAuthState,
  RawExtractedLead,
  SourceAdapter,
} from "../adapter-types";

const HIPAGES_BASE_URL = "https://www.hipages.com.au";
const HIPAGES_LEADS_LIST_PATH = "/tradie/jobs";

const LEAD_CARD_SELECTOR = 'article[data-tracking-label="Lead Card"]';

const LIST_WAIT_MS = 20_000;

function takeFailureScreenshot(page: BrowserScanContext["page"], label: string): void {
  if (process.env.SCREENSHOT_ON_FAILURE !== "1" && process.env.SCREENSHOT_ON_FAILURE !== "true") return;
  const dir = resolve(process.cwd(), ".screenshots");
  mkdirSync(dir, { recursive: true });
  const screenshotPath = resolve(dir, `hipages-${label}-${Date.now()}.png`);
  page.screenshot({ path: screenshotPath }).catch(() => {});
  console.error("[hipages] Screenshot on failure:", screenshotPath);
}

export class HipagesAdapter implements SourceAdapter {
  readonly platformId = "hipages";

  /** Lead card CSS selector — exposed so the scan runner can wait for cards before calling extractLeads. */
  readonly leadCardSelector = LEAD_CARD_SELECTOR;

  /** Hostname this adapter handles — used for URL-based adapter lookup when source.platform is generic. */
  readonly leadsUrlHostname = "hipages.com.au";

  async open(context: BrowserScanContext): Promise<void> {
    console.log("[hipages] Opening...");
    const url = context.baseURL ?? HIPAGES_BASE_URL;
    await context.page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    console.log("[hipages] Opened", url);
  }

  async loginIfNeeded(
    _context: BrowserScanContext,
    authState?: AdapterAuthState
  ): Promise<AdapterAuthState | null> {
    // Session comes from the scan runner (storage state loaded when context is created).
    return authState ?? null;
  }

  async navigateToList(context: BrowserScanContext): Promise<void> {
    console.log("[hipages] Navigating to leads list...");
    const listUrl =
      process.env.HIPAGES_LEADS_LIST_URL?.trim() ||
      (context.baseURL ?? HIPAGES_BASE_URL).replace(/\/$/, "") + HIPAGES_LEADS_LIST_PATH;

    try {
      await context.page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: LIST_WAIT_MS });
    } catch (e) {
      takeFailureScreenshot(context.page, "navigate");
      throw new Error(
        "Hipages: leads list did not load (check auth or HIPAGES_LEADS_LIST_URL). " +
          (e instanceof Error ? e.message : String(e))
      );
    }

    // Wait for at least one lead card to appear (SPA renders list after domcontentloaded).
    try {
      await context.page.waitForSelector(LEAD_CARD_SELECTOR, { timeout: LIST_WAIT_MS });
    } catch {
      takeFailureScreenshot(context.page, "list-not-found");
      throw new Error(
        "Hipages: no lead cards found within 20s — check auth session or leads URL."
      );
    }

    console.log("[hipages] Navigated to leads list");
  }

  async extractLeads(context: BrowserScanContext): Promise<RawExtractedLead[]> {
    try {
      const cards = await context.page.locator(LEAD_CARD_SELECTOR).all();

      if (cards.length === 0) {
        console.log("[hipages] No lead cards found");
        return [];
      }

      const leads: RawExtractedLead[] = [];
      let skipped = 0;
      const skipReasons: string[] = [];

      for (let i = 0; i < cards.length; i++) {
        try {
          const lead = await this.extractOneCard(cards[i]!, i);
          if (lead) {
            leads.push(lead);
          } else {
            skipped++;
            skipReasons.push(`card[${i}]: no externalId`);
          }
        } catch (e) {
          skipped++;
          const reason = e instanceof Error ? e.message : String(e);
          skipReasons.push(`card[${i}]: ${reason}`);
          console.warn("[hipages] Skip card", i, reason);
        }
      }

      console.log(`[hipages] Extracted ${leads.length} leads, skipped ${skipped}`, skipReasons);
      return leads;
    } catch (e) {
      takeFailureScreenshot(context.page, "extract");
      throw new Error(
        "Hipages: extractLeads failed. " + (e instanceof Error ? e.message : String(e))
      );
    }
  }

  private async extractOneCard(card: Locator, index: number): Promise<RawExtractedLead | null> {
    // ── externalId from accept link: /leads/{id}/accept ──────────────────────
    let externalId: string | undefined;
    try {
      const href = await card
        .locator('a[href^="/leads/"][href$="/accept"]')
        .first()
        .getAttribute("href");
      if (href) {
        // IDs are UUIDs (e.g. 019cfaea-a0ce-7743-81ef-5ec0f7a9f9ef), not numeric
        const match = /\/leads\/([^/]+)\/accept/.exec(href);
        if (match?.[1]) externalId = match[1];
      }
    } catch {
      // href not found — externalId stays undefined
    }

    // ── customer name ─────────────────────────────────────────────────────────
    const customerName = await this.safeText(card, "h2");

    // ── posted date ───────────────────────────────────────────────────────────
    // Extract both the machine-readable datetime attribute (for sorting) and the
    // visible text (for display) so we preserve hipages's own AM/PM representation.
    let postedAt: string | undefined;
    let postedAtText: string | undefined;
    try {
      const timeEl = card.locator("time[datetime]").first();
      const attr = await timeEl.getAttribute("datetime").catch(() => null);
      const text = await timeEl.textContent().catch(() => null);
      if (attr?.trim()) postedAt = attr.trim();
      if (text?.trim()) postedAtText = text.trim();
    } catch {
      // optional
    }

    // ── location + service type from card DOM traversal ───────────────────────
    const { locationText, serviceType } = await card
      .evaluate((el) => {
        // Find all direct-child sections of the article
        const sections = Array.from(el.querySelectorAll(":scope > section"));
        // Second section (index 1) contains location and service type rows
        const detailSection = sections[1] ?? sections[0];
        if (!detailSection) return { locationText: "", serviceType: "" };

        // Collect text of each direct child element that has non-empty text
        const rows = Array.from(detailSection.querySelectorAll(":scope > *"))
          .map((child) => (child as HTMLElement).innerText?.trim() ?? child.textContent?.trim() ?? "")
          .filter((t) => t.length > 0);

        return {
          locationText: rows[0] ?? "",
          serviceType: rows[1] ?? "",
        };
      })
      .catch(() => ({ locationText: "", serviceType: "" }));

    // ── parse suburb + postcode from locationText ─────────────────────────────
    let suburb = "";
    let postcode: string | undefined;
    if (locationText) {
      // Common format: "Suburb NSW 2067" or "Suburb, 2067" or "Suburb 2067"
      const pcMatch = locationText.match(/\b(\d{4})\b/);
      if (pcMatch) {
        postcode = pcMatch[1];
        suburb = locationText
          .replace(/\b\d{4}\b/, "")
          .replace(/,\s*$/, "")
          .trim();
        // Strip trailing state abbreviation if present (e.g. "NSW", "VIC")
        suburb = suburb.replace(/\s+[A-Z]{2,3}$/, "").trim();
      } else {
        suburb = locationText.trim();
      }
    }

    // ── lead cost (credit cost shown near accept button) ─────────────────────
    const costResult = await card
      .evaluate((el) => {
        // If the card shows "Free" anywhere (e.g. strikethrough "34 credits" + "Free" in another element), show only "Free".
        const fullTextFirst = (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
        if (/\bfree\b/i.test(fullTextFirst)) return { leadCost: "Free", snippet: "" };
        // hipages shows the cost as a dollar amount or "N credits" near the accept/decline footer.
        const costOnly = (text: string): string | null => {
          const t = text.trim();
          if (/^free$/i.test(t)) return "Free";
          if (/^\$\d+(\.\d+)?$/.test(t) || /^\d+(\.\d+)?\s+credits?$/i.test(t)) return t;
          const withSuffix = /^(\$\d+(?:\.\d+)?|\d+(?:\.\d+)?\s+credits?)\s*-\s*./i.exec(t);
          if (withSuffix) return withSuffix[1].trim();
          return null;
        };
        // Cost often lives in article > section:nth-child(13) > div > span (footer/cost area).
        const sections = Array.from(el.querySelectorAll(":scope > section"));
        const costSection = sections[12];
        if (costSection) {
          const sectionText = (costSection as HTMLElement).innerText?.trim() ?? costSection.textContent?.trim() ?? "";
          // If it has "free", only display "Free" (don't show strikethrough credits).
          if (/\bfree\b/i.test(sectionText)) return { leadCost: "Free", snippet: "" };
          const cost = costOnly(sectionText);
          if (cost) return { leadCost: cost, snippet: "" };
          const span = costSection.querySelector("div span");
          const spanText = span ? (span as HTMLElement).innerText?.trim() ?? span.textContent?.trim() ?? "" : "";
          if (spanText) {
            if (/\bfree\b/i.test(spanText)) return { leadCost: "Free", snippet: "" };
            const costFromSpan = costOnly(spanText);
            if (costFromSpan) return { leadCost: costFromSpan, snippet: "" };
            const creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(spanText);
            if (creditsMatch) return { leadCost: `${creditsMatch[1]} credits`, snippet: "" };
            const dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(spanText);
            if (dollarMatch) return { leadCost: `$${dollarMatch[1]}`, snippet: "" };
          }
        }
        const allEls = Array.from(el.querySelectorAll("*"));
        for (const node of allEls) {
          if (node.children.length > 0) continue;
          const text = (node as HTMLElement).innerText?.trim() ?? node.textContent?.trim() ?? "";
          const cost = costOnly(text);
          if (cost) return { leadCost: cost, snippet: "" };
        }
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent?.trim() ?? "";
          const cost = costOnly(text);
          if (cost) return { leadCost: cost, snippet: "" };
          if (/\$\d+(\.\d+)?/.test(text) && text.length < 20) return { leadCost: text.trim(), snippet: "" };
          node = walker.nextNode();
        }
        // Fallback: cost may be split across elements. Search full card text.
        const fullText = (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
        // If it has "free", only display "Free" (don't show strikethrough credits).
        if (/\bfree\b/i.test(fullText)) return { leadCost: "Free", snippet: "" };
        const dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(fullText);
        if (dollarMatch) return { leadCost: `$${dollarMatch[1]}`, snippet: "" };
        const creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(fullText);
        if (creditsMatch) return { leadCost: `${creditsMatch[1]} credits`, snippet: "" };
        // No cost found: return snippet of card text for debugging (last 400 chars often contain footer/cost area).
        const snippet = fullText.length > 400 ? fullText.slice(-400) : fullText;
        return { leadCost: null, snippet: snippet.replace(/\s+/g, " ").trim() };
      })
      .catch(() => ({ leadCost: null, snippet: "" }));

    let leadCost =
      costResult && typeof costResult === "object" && "leadCost" in costResult
        ? costResult.leadCost
        : null;
    let snippet =
      costResult && typeof costResult === "object" && "snippet" in costResult
        ? String(costResult.snippet ?? "")
        : "";
    // When card had no text (empty snippet), SPA may not have painted yet. Retry once after a short delay.
    let retryUsed = false;
    let retryRecovered = false;
    if (leadCost == null && snippet === "") {
      retryUsed = true;
      await new Promise((r) => setTimeout(r, 800));
      const retryResult = await card
        .evaluate((el) => {
          const fullTextFirst = (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
          if (/\bfree\b/i.test(fullTextFirst)) return { leadCost: "Free", snippet: "" };
          const costOnly = (text: string): string | null => {
            const t = text.trim();
            if (/^free$/i.test(t)) return "Free";
            if (/^\$\d+(\.\d+)?$/.test(t) || /^\d+(\.\d+)?\s+credits?$/i.test(t)) return t;
            const withSuffix = /^(\$\d+(?:\.\d+)?|\d+(?:\.\d+)?\s+credits?)\s*-\s*./i.exec(t);
            if (withSuffix) return withSuffix[1].trim();
            return null;
          };
          const sections = Array.from(el.querySelectorAll(":scope > section"));
          const costSection = sections[12];
          if (costSection) {
            const sectionText = (costSection as HTMLElement).innerText?.trim() ?? costSection.textContent?.trim() ?? "";
            if (/\bfree\b/i.test(sectionText)) return { leadCost: "Free", snippet: "" };
            const cost = costOnly(sectionText);
            if (cost) return { leadCost: cost, snippet: "" };
            const span = costSection.querySelector("div span");
            const spanText = span ? (span as HTMLElement).innerText?.trim() ?? span.textContent?.trim() ?? "" : "";
            if (spanText && /\bfree\b/i.test(spanText)) return { leadCost: "Free", snippet: "" };
            if (spanText) {
              const creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(spanText);
              if (creditsMatch) return { leadCost: `${creditsMatch[1]} credits`, snippet: "" };
              const dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(spanText);
              if (dollarMatch) return { leadCost: `$${dollarMatch[1]}`, snippet: "" };
            }
          }
          const fullText = (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
          if (/\bfree\b/i.test(fullText)) return { leadCost: "Free", snippet: "" };
          const dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(fullText);
          if (dollarMatch) return { leadCost: `$${dollarMatch[1]}`, snippet: "" };
          const creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(fullText);
          if (creditsMatch) return { leadCost: `${creditsMatch[1]} credits`, snippet: "" };
          return { leadCost: null, snippet: fullText.slice(-400).replace(/\s+/g, " ").trim() };
        })
        .catch(() => ({ leadCost: null, snippet: "" }));
      if (retryResult && typeof retryResult === "object" && retryResult.leadCost) {
        leadCost = retryResult.leadCost;
        snippet = String(retryResult.snippet ?? "");
        retryRecovered = true;
      }
    }

    // #region agent log
    fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a5692" },
      body: JSON.stringify({
        sessionId: "7a5692",
        location: "hipages-adapter.ts:extractOneCard:leadCost",
        message: "scanner leadCost extracted",
        data: { index, leadCost: leadCost ?? null, hasCost: !!leadCost, snippetWhenNull: leadCost ? undefined : snippet.slice(0, 250), retryUsed, retryRecovered },
        timestamp: Date.now(),
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion

    // ── job description from "Job Description" section ────────────────────────
    const description = await card
      .evaluate((el) => {
        // Walk all sections; find one whose heading contains "Job Description"
        const sections = Array.from(el.querySelectorAll(":scope > section"));
        for (const section of sections) {
          const heading = section.querySelector("h2, h3, h4, strong");
          if (heading?.textContent?.includes("Job Description")) {
            return section.querySelector("p")?.textContent?.trim() ?? "";
          }
        }
        // Fallback: search any heading anywhere in the card
        const headings = Array.from(el.querySelectorAll("h2, h3, h4, strong"));
        for (const heading of headings) {
          if (heading.textContent?.includes("Job Description")) {
            const parent = heading.parentElement;
            return parent?.querySelector("p")?.textContent?.trim() ?? "";
          }
        }
        return "";
      })
      .catch(() => "");

    // ── available actions (accept / decline / waitlist / join-waitlist) ─────────
    // Collect all action hrefs present on the card so the UI can show the right buttons.
    // Also capture the visible button label (e.g. "Join Waitlist") so the UI matches hipages exactly.
    const hipagesActions = await card
      .evaluate((el) => {
        const result: {
          accept?: string;
          acceptLabel?: string;
          decline?: string;
          declineLabel?: string;
          waitlist?: string;
          waitlistLabel?: string;
        } = {};
        // Cast to NodeListOf<HTMLAnchorElement> won't work inside evaluate, so cast inline
        const links = Array.from(el.querySelectorAll("a")) as HTMLAnchorElement[];
        for (const a of links) {
          const rawHref = a.getAttribute("href") ?? "";
          // Resolve to pathname whether the href is absolute or relative
          let path: string;
          try {
            path = new URL(a.href).pathname;
          } catch {
            path = rawHref.split("?")[0] ?? rawHref;
          }
          const label = a.innerText?.trim() ?? a.textContent?.trim() ?? "";

          if (path.includes("/accept")) {
            result.accept = path;
            result.acceptLabel = label || "Accept";
          } else if (path.includes("/decline")) {
            result.decline = path;
            result.declineLabel = label || "Decline";
          } else if (path.includes("/waitlist")) {
            result.waitlist = path;
            result.waitlistLabel = label || "Waitlist";
          }
        }
        return result;
      })
      .catch(() => ({} as { accept?: string; acceptLabel?: string; decline?: string; declineLabel?: string; waitlist?: string; waitlistLabel?: string }));

    // ── attachments (photos/documents linked from the card) ───────────────────
    const attachments = await card
      .evaluate((el) => {
        const base = typeof document !== "undefined" ? document.baseURI || window.location.origin : "";
        const resolve = (href: string) => {
          if (!href) return "";
          try {
            return new URL(href, base).href;
          } catch {
            return href;
          }
        };
        const seen = new Set<string>();
        const list: { url: string; label?: string }[] = [];
        const add = (url: string, label?: string) => {
          const u = resolve(url);
          if (!u || seen.has(u)) return;
          seen.add(u);
          list.push({ url: u, label: label?.trim() || undefined });
        };
        const actionPaths = ["/accept", "/decline", "/waitlist"];
        const linkKeywords = /attachment|photo|image|file|document|download|view\s*(photo|image|file)?|media|gallery/i;
        const pathHints = /\/attachment|\/photo|\/image|\/file|\/document|\/media|\/asset|\/upload|\/storage/i;
        const fileExt = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)(\?|$)/i;

        // 0) Hipages canonical attachment URLs (e.g. <a href="https://attachments.hipagesusercontent.com/...">)
        const hipagesAttachmentLinks = el.querySelectorAll('a[href*="attachments.hipagesusercontent.com"], a[href*="hipagesusercontent.com"]');
        for (const a of hipagesAttachmentLinks) {
          const anchor = a as HTMLAnchorElement;
          const href = anchor.getAttribute("href") ?? "";
          if (actionPaths.some((p) => href.toLowerCase().includes(p))) continue;
          const label = (anchor.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.innerText?.trim() ?? anchor.textContent?.trim() ?? "").slice(0, 80);
          add(anchor.href, label || undefined);
        }

        // 1) Links inside a section whose heading suggests attachments (e.g. "1 Attachment", "Photos")
        const sections = Array.from(el.querySelectorAll(":scope > section, section"));
        for (const section of sections) {
          const heading = section.querySelector("h2, h3, h4, h5, strong, [class*='heading']");
          const headingText = (heading?.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
          if (!/attachment|photo|image|document|file|media|gallery/.test(headingText)) continue;
          const sectionLinks = section.querySelectorAll("a[href]");
          for (const a of sectionLinks) {
            const anchor = a as HTMLAnchorElement;
            const href = anchor.getAttribute("href") ?? "";
            const path = (href.split("?")[0] ?? href).toLowerCase();
            if (actionPaths.some((p) => path.includes(p))) continue;
            const label = (anchor.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.innerText?.trim() ?? anchor.textContent?.trim() ?? "").slice(0, 80);
            add(anchor.href, label || undefined);
          }
          const sectionImgs = section.querySelectorAll("img[src]");
          for (const img of sectionImgs) {
            const im = img as HTMLImageElement;
            const src = im.getAttribute("src");
            if (src) add(src, (im.getAttribute("alt") ?? "Image").trim());
          }
        }

        // 2) Card-wide: any link that looks like an attachment (keywords, path hints, or file extension)
        const links = Array.from(el.querySelectorAll("a[href]")) as HTMLAnchorElement[];
        for (const a of links) {
          const href = a.getAttribute("href") ?? "";
          const path = (href.split("?")[0] ?? href).toLowerCase();
          if (actionPaths.some((p) => path.includes(p))) continue;
          const label = (a.innerText?.trim() ?? a.textContent?.trim() ?? "").slice(0, 80);
          const isAttachment =
            linkKeywords.test(href) ||
            linkKeywords.test(path) ||
            linkKeywords.test(label) ||
            pathHints.test(path) ||
            fileExt.test(path);
          if (isAttachment) add(a.href, label || undefined);
        }

        // 3) All images in the card (thumbnails, etc.)
        const imgs = Array.from(el.querySelectorAll("img[src]")) as HTMLImageElement[];
        for (const img of imgs) {
          const src = img.getAttribute("src");
          if (src) add(src, (img.getAttribute("alt") ?? "Image").trim());
        }

        return list;
      })
      .catch(() => [] as { url: string; label?: string }[]);

    // Skip this lead if we can't identify it (no externalId means we can't deduplicate)
    if (!externalId) {
      console.warn(`[hipages] Card ${index}: skipping — could not extract externalId from accept link`);
      return null;
    }

    // Use serviceType as title (most meaningful); fall back to customerName
    const title = serviceType || customerName || "Lead";

    return {
      externalId,
      title,
      description,
      suburb,
      postcode,
      raw: {
        customerName,
        postedAt: postedAt ?? null,
        postedAtText: postedAtText ?? null,
        locationText,
        serviceType,
        leadCost: leadCost ?? null,
        hipagesActions: Object.keys(hipagesActions).length > 0 ? hipagesActions : null,
        attachments: attachments.length > 0 ? attachments : null,
      },
    };
  }

  /** Safely get trimmed text content from the first matching element in a card. Returns "" on miss. */
  private async safeText(card: Locator, selector: string): Promise<string> {
    try {
      const text = await card
        .locator(selector)
        .first()
        .textContent({ timeout: 2000 })
        .catch(() => null);
      return text?.trim() ?? "";
    } catch {
      return "";
    }
  }
}
