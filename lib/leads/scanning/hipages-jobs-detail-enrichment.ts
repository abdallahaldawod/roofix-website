/**
 * Hipages jobs: scrape main job page + customer-enquiry page, merge into hipages_jobs documents.
 * No platform actions (no Accept/Decline/Submit).
 */

import { appendFileSync } from "fs";
import { join } from "path";
import type { HipagesJobUpsertPayload } from "@/lib/leads/hipages-jobs-admin";
import { getHipagesJobByIdAdmin, upsertHipagesJobAdmin } from "@/lib/leads/hipages-jobs-admin";
import type { HipagesJobListRow } from "./hipages-jobs-list-scanner";
import { logJobsEnrichment } from "./jobs-enrichment-logger";

const HIPAGES_BASE = "https://business.hipages.com.au";
const DEBUG_ENDPOINT = "http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1";
const DEBUG_SESSION_ID = "b3ba84";
const DEBUG_LOG_FILE = join(process.cwd(), ".cursor", "debug-b3ba84.log");

/** Ingest HTTP often fails from scanner workers; mirror to NDJSON file for evidence. */
function agentDebugLog(entry: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}): void {
  const body = { sessionId: DEBUG_SESSION_ID, timestamp: Date.now(), ...entry };
  try {
    appendFileSync(DEBUG_LOG_FILE, `${JSON.stringify(body)}\n`, "utf8");
  } catch {
    /* ignore */
  }
  try {
    void fetch(DEBUG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function recordHasMeaningfulValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** Hipages intermittently returns 5xx on document navigations; empty shell DOM follows. */
const HIPAGES_GOTO_MAX_ATTEMPTS = 3;
const HIPAGES_GOTO_RETRY_DELAY_MS = 1_000;

function navigationResponseStatus(resp: unknown): number | null {
  if (resp == null || typeof resp !== "object") return null;
  const s = (resp as { status?: () => number }).status;
  return typeof s === "function" ? s() : null;
}

function isOkHttpStatus(status: number | null): boolean {
  return status != null && status >= 200 && status < 400;
}

/**
 * Retry `page.goto` when the navigation response is missing or not 2xx (runtime evidence: 500 → empty extract).
 */
async function gotoWithStatusRetry(
  page: EnrichmentPage,
  url: string
): Promise<{ navStatus: number | null; gotoAttempts: number }> {
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= HIPAGES_GOTO_MAX_ATTEMPTS; attempt++) {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    lastStatus = navigationResponseStatus(resp);
    if (isOkHttpStatus(lastStatus)) {
      return { navStatus: lastStatus, gotoAttempts: attempt };
    }
    if (attempt < HIPAGES_GOTO_MAX_ATTEMPTS) {
      await page.waitForTimeout(HIPAGES_GOTO_RETRY_DELAY_MS);
    }
  }
  return { navStatus: lastStatus, gotoAttempts: HIPAGES_GOTO_MAX_ATTEMPTS };
}

// ─── Types (only defined fields; no undefined in Firestore payloads) ─────────

export type MainJobDetailData = Partial<{
  title: string;
  /** Job / customer enquiry copy on `/jobs/{id}` when enquiry-only page omits it. */
  description: string;
  serviceType: string;
  customerName: string;
  phone: string;
  email: string;
  suburb: string;
  postcode: string;
  attachments: { url: string; label?: string }[];
}>;

export type CustomerEnquiryData = Partial<{
  customerName: string;
  phone: string;
  email: string;
  suburb: string;
  postcode: string;
  description: string;
  leadId: string;
  title: string;
  /** From structured "Lead posted on:" row time[datetime]; null when missing. */
  postedAt: { seconds: number; nanoseconds: number } | null;
  /** ISO string from time[datetime]; null when missing. */
  postedAtIso: string | null;
  postedAtText: string | null;
  /** Explicit `null` when no cost was found on the page (merge treats as “no enquiry cost”). */
  leadCost: string | null;
  leadCostCredits: number | null;
  attachments: { url: string; label?: string }[];
}>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Canonical main job page: `/jobs/{jobId}` (not customer-enquiry). */
export function toMainJobDetailUrl(jobId: string): string {
  return `${HIPAGES_BASE}/jobs/${jobId}`;
}

export function toCustomerEnquiryUrl(jobIdOrHref: string): string {
  const m = jobIdOrHref.match(/\/jobs\/(\d+)/);
  if (m) return `${HIPAGES_BASE}/jobs/${m[1]}/customer-enquiry`;
  if (/^\d+$/.test(jobIdOrHref)) return `${HIPAGES_BASE}/jobs/${jobIdOrHref}/customer-enquiry`;
  return jobIdOrHref.startsWith("http") ? jobIdOrHref : new URL(jobIdOrHref, HIPAGES_BASE + "/jobs").href;
}

function parseLeadCostCredits(leadCost: string | null | undefined): number | null {
  if (leadCost == null || typeof leadCost !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)\s*credits?$/i.exec(leadCost.trim()) ?? /\s+(\d+(?:\.\d+)?)\s*credits?/i.exec(leadCost);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Prefer non-empty, longer string. */
function preferString(
  ...sources: (string | undefined | null)[]
): string | undefined {
  let best: string | undefined;
  for (const s of sources) {
    const t = typeof s === "string" ? s.trim() : "";
    if (t && (!best || t.length > best.length)) best = t;
  }
  return best;
}

/** Merge attachments, dedupe by url. */
function mergeAttachments(
  ...lists: ({ url: string; label?: string }[] | undefined)[]
): { url: string; label?: string }[] {
  const seen = new Set<string>();
  const out: { url: string; label?: string }[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      const url = typeof a?.url === "string" ? a.url.trim() : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, label: typeof a.label === "string" ? a.label.trim() || undefined : undefined });
    }
  }
  return out;
}

// ─── Merge for hipages_jobs ─────────────────────────────────────────────────

/**
 * Merges list row + main job page + customer enquiry into a Firestore upsert payload.
 * Omits cost fields when the enquiry page did not surface a cost and an existing doc has cost (preserve).
 */
export function buildHipagesJobUpsertPayload(
  listRow: HipagesJobListRow,
  mainDetail: MainJobDetailData | null,
  enquiryDetail: CustomerEnquiryData | null,
  existing: Record<string, unknown> | null,
  ctx: { sourceId: string },
  options?: { preserveCostWhenMissing?: boolean }
): HipagesJobUpsertPayload {
  const preserveCost = options?.preserveCostWhenMissing !== false;

  const customerName =
    preferString(
      enquiryDetail?.customerName,
      mainDetail?.customerName,
      listRow.customerName
    ) ?? null;
  const email = preferString(enquiryDetail?.email, mainDetail?.email) ?? null;
  const phone = preferString(enquiryDetail?.phone, mainDetail?.phone) ?? null;
  const title =
    preferString(enquiryDetail?.title, mainDetail?.title, listRow.title) ?? null;

  const previewDescription = listRow.description ?? null;
  const enquiryDesc = enquiryDetail?.description?.trim() || null;
  const mainDesc = mainDetail?.description?.trim() || null;
  const existingFull =
    typeof existing?.fullDescription === "string" ? existing.fullDescription.trim() : null;
  const fullDescription =
    enquiryDesc && enquiryDesc.length > 0
      ? enquiryDesc.slice(0, 8000)
      : mainDesc && mainDesc.length > 0
        ? mainDesc.slice(0, 8000)
        : existingFull && existingFull.length > 0
          ? existingFull
          : previewDescription;

  const suburb =
    preferString(enquiryDetail?.suburb, mainDetail?.suburb, listRow.suburb) ?? null;
  const postcode =
    preferString(enquiryDetail?.postcode, mainDetail?.postcode, listRow.postcode) ?? null;
  const serviceType = preferString(mainDetail?.serviceType) ?? null;

  const mergedAttachments = mergeAttachments(mainDetail?.attachments, enquiryDetail?.attachments);

  const base: HipagesJobUpsertPayload = {
    jobId: listRow.jobId,
    href: listRow.href,
    sourceId: ctx.sourceId,
    sourceName: "Hipages",
    source: "hipages",
    customerName,
    email,
    phone,
    title,
    description: previewDescription ?? mainDesc ?? enquiryDesc ?? null,
    fullDescription: fullDescription ?? null,
    suburb,
    postcode,
    serviceType,
    jobStatus: listRow.jobStatus ?? null,
    canCreateQuote: listRow.canCreateQuote,
  };
  if (mergedAttachments.length > 0) base.attachments = mergedAttachments;

  const enquiryCost = enquiryDetail?.leadCost;
  const enquiryCredits = enquiryDetail?.leadCostCredits;
  const listCostRaw = listRow.leadCostFromList?.trim();
  if (enquiryCost != null && String(enquiryCost).trim() !== "") {
    const lc = String(enquiryCost).trim();
    base.leadCost = lc;
    base.leadCostCredits = enquiryCredits ?? parseLeadCostCredits(lc);
  } else if (listCostRaw) {
    base.leadCost = listCostRaw;
    base.leadCostCredits =
      listRow.leadCostCreditsFromList ?? parseLeadCostCredits(listCostRaw);
  } else if (
    preserveCost &&
    existing &&
    (existing.leadCost != null || existing.leadCostCredits != null)
  ) {
    /* omit — merge keeps previous */
  } else {
    base.leadCost = null;
    base.leadCostCredits = null;
  }

  if (enquiryDetail?.postedAt != null) {
    base.postedAt = enquiryDetail.postedAt;
  } else if (listRow.postedAtFromList != null) {
    base.postedAt = listRow.postedAtFromList;
  }
  const iso = preferString(enquiryDetail?.postedAtIso, listRow.postedAtIsoFromList);
  if (iso) base.postedAtIso = iso;
  const ptext = preferString(enquiryDetail?.postedAtText, listRow.postedAtTextFromList);
  if (ptext) base.postedAtText = ptext;

  return base;
}

// ─── Page interface (Playwright page subset) ──────────────────────────────────

export type EnrichmentPage = {
  /** Playwright-compatible; options kept loose so real `Page` is assignable. */
  url?: () => string;
  goto: (url: string, opts?: object) => Promise<unknown>;
  waitForURL: (url: RegExp, opts?: { timeout?: number }) => Promise<unknown>;
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<unknown>;
  locator: (selector: string) => { first: () => { click: (opts?: { timeout?: number }) => Promise<unknown> } };
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: {
    <T>(fn: () => T): Promise<T>;
    <T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  };
};

// ─── Main job detail page extraction (runs in browser) ────────────────────────

function extractMainJobDetailInPage(): MainJobDetailData {
  const out: MainJobDetailData = {};
  const main = document.querySelector("main");
  if (!main) return out;

  const h1 = main.querySelector("h1");
  if (h1?.textContent?.trim()) out.title = h1.textContent.trim().slice(0, 500);

  const customerCard =
    main.querySelector('[data-tracking-label="Customer"]') ??
    main.querySelector('[data-tracking-label="customer"]') ??
    main.querySelector('[aria-label="customer card"]');
  if (customerCard) {
    const nameEl =
      customerCard.querySelector("p.text-title-sm, p[class*='title'], [class*='text-title']") ??
      customerCard.querySelector("p");
    const name = nameEl?.textContent?.trim()?.slice(0, 200);
    if (name) out.customerName = name;
    const phoneEl = customerCard.querySelector('a[data-tracking-label="Customer Phone Number"], a[href^="tel:"]') as HTMLAnchorElement | null;
    if (phoneEl) {
      const p = phoneEl.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? phoneEl.textContent?.trim();
      if (p) out.phone = p;
    }
    const emailEl = customerCard.querySelector('a[data-tracking-label="Customer Email Address"], a[href^="mailto:"]') as HTMLAnchorElement | null;
    if (emailEl) {
      const e = emailEl.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? emailEl.textContent?.trim();
      if (e) out.email = e;
    }
    const addressEl = customerCard.querySelector('a[data-tracking-label="Address link"]');
    const addressText = addressEl?.textContent?.trim() ?? "";
    if (addressText) {
      const m = addressText.match(/^(.+?),?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*,?\s*(\d{4})$/i) ?? addressText.match(/\b(\d{4})\b/);
      if (m) {
        out.postcode = m[2] ?? m[1] ?? "";
        const sub = (m[1] ?? "").replace(/,/g, "").trim();
        out.suburb = sub === out.postcode ? addressText.replace(/\s*,\s*[A-Z]{2,3}\s*,?\s*\d{4}\s*$/i, "").trim().slice(0, 100) : sub.slice(0, 100);
      } else {
        out.suburb = addressText.slice(0, 100);
      }
    }
  }

  const serviceLabels = Array.from(main.querySelectorAll("label, span, p, h2, h3")).filter(
    (el) => /service|category|job type/i.test((el.textContent ?? "").trim())
  );
  for (const label of serviceLabels) {
    const next = label.nextElementSibling;
    const t = next?.textContent?.trim()?.slice(0, 200);
    if (t && t.length > 1) {
      out.serviceType = t;
      break;
    }
  }

  const mainContent =
    main.querySelector('section[class*="gap-x-layout-gutter"]') ?? main.querySelector("section") ?? main;
  if (mainContent) {
    const h2Enquiry = Array.from(mainContent.querySelectorAll("h2")).find((h) =>
      (h.textContent ?? "").toLowerCase().includes("customer enquiry")
    );
    if (h2Enquiry) {
      const next = h2Enquiry.nextElementSibling;
      let enquiryText =
        next?.textContent?.trim().replace(/^\s*customer\s*enquiry\s*:?\s*/i, "").trim().slice(0, 2000) ?? "";
      const badInDescription = /\b(navigation|open in google maps|lead id\s*\d+|settings|mobile menu)\b/i;
      const hasEmailOrPhone = /@|(?:\b04\d{8}\b|\b\d{4}\s*\d{3}\s*\d{3}\b)/;
      if (
        enquiryText &&
        (badInDescription.test(enquiryText) || (enquiryText.length > 400 && hasEmailOrPhone.test(enquiryText)))
      ) {
        const afterLeadId = enquiryText.match(/lead\s*id\s*\d+\s*([\s\S]+)/i)?.[1]?.trim();
        if (afterLeadId && afterLeadId.length > 15 && !badInDescription.test(afterLeadId))
          enquiryText = afterLeadId.slice(0, 2000);
        else if (enquiryText.includes("Customer enquiry")) {
          const afterEnquiry = enquiryText.split(/customer\s*enquiry\s*:?\s*/i).pop()?.trim().slice(0, 2000);
          if (afterEnquiry && afterEnquiry.length > 15) enquiryText = afterEnquiry;
        } else enquiryText = "";
      }
      if (enquiryText) out.description = enquiryText;
    }
    if (!out.description) {
      const descSection = Array.from(mainContent.querySelectorAll("div, section")).find(
        (el) =>
          (el.textContent ?? "").toLowerCase().includes("description") &&
          (el.textContent?.length ?? 0) > 20 &&
          (el.textContent?.length ?? 0) < 3000
      );
      if (descSection) {
        const full = descSection.textContent?.trim() ?? "";
        const desc = full.replace(/description\s*/i, "").trim().slice(0, 2000);
        if (desc) out.description = desc;
      }
    }
  }

  const attachments: { url: string; label?: string }[] = [];
  const base = document.baseURI || window.location.origin;
  const resolve = (href: string) => { try { return new URL(href, base).href; } catch { return href; } };
  const gallery = main.querySelector('[data-tracking-label="Thumbnail gallery"]');
  if (gallery) {
    gallery.querySelectorAll("a[href], img[src]").forEach((el) => {
      const a = el as HTMLAnchorElement | HTMLImageElement;
      const url = ("href" in a && a.href) ? resolve(a.href) : ("src" in a && a.src) ? resolve(a.src) : "";
      if (url && !/\/accept|\/decline|\/waitlist/.test(url)) {
        const label = ("alt" in a && a.alt) ? a.alt : el.textContent?.trim()?.slice(0, 80);
        attachments.push({ url, label: label || undefined });
      }
    });
  }
  main.querySelectorAll('a[href*="attachments.hipagesusercontent.com"], a[href*="hipagesusercontent.com"]').forEach((a) => {
    const anchor = a as HTMLAnchorElement;
    const href = anchor.getAttribute("href") ?? anchor.href;
    if (href && !/\/accept|\/decline|\/waitlist/.test(href)) {
      const url = resolve(href);
      const label = anchor.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.textContent?.trim()?.slice(0, 80);
      if (url) attachments.push({ url, label: label || undefined });
    }
  });
  if (attachments.length > 0) out.attachments = attachments;

  return out;
}

/**
 * Scrapes the main job detail page (/jobs/{id}). Read-only. Returns null on failure.
 */
export async function scrapeMainJobDetailPage(
  page: EnrichmentPage,
  jobDetailUrl: string
): Promise<MainJobDetailData | null> {
  try {
    const { navStatus, gotoAttempts } = await gotoWithStatusRetry(page, jobDetailUrl);
    const waitForUrlOk = await page.waitForURL(/\/jobs\/\d+/, { timeout: 10_000 }).then(() => true).catch(() => false);
    const waitForMainOk = await page.waitForSelector("main", { timeout: 8_000 }).then(() => true).catch(() => false);
    const data = await page.evaluate(extractMainJobDetailInPage);
    // #region agent log
    agentDebugLog({
      runId: "run7",
      hypothesisId: "H6",
      location: "hipages-jobs-detail-enrichment.ts:scrapeMainJobDetailPage",
      message: "main_detail_readiness",
      data: {
        jobDetailUrl,
        navStatus,
        gotoAttempts,
        waitForUrlOk,
        waitForMainOk,
        extractedKeys: Object.keys(data),
        hasCustomerName: !!data.customerName,
        hasEmail: !!data.email,
        hasPhone: !!data.phone,
        hasSuburb: !!data.suburb,
        hasDescription: !!data.description,
        attachmentsCount: data.attachments?.length ?? 0,
      },
    });
    // #endregion
    return Object.keys(data).length > 0 ? data : null;
  } catch (e) {
    // #region agent log
    agentDebugLog({
      runId: "run7",
      hypothesisId: "H6",
      location: "hipages-jobs-detail-enrichment.ts:scrapeMainJobDetailPage",
      message: "main_detail_catch",
      data: { jobDetailUrl, error: e instanceof Error ? e.message : String(e) },
    });
    // #endregion
    return null;
  }
}

// ─── Customer enquiry page extraction (runs in browser) ───────────────────────

/** Runs in browser; `clickSucceeded` is whether the cost-card Playwright click resolved. */
function extractCustomerEnquiryInPage(clickSucceeded: boolean): CustomerEnquiryData & {
  _costExtractionDebug: {
    costCardClickSucceeded: boolean;
    structuredCreditsRowFound: boolean;
    rawCreditsValue: string | null;
    containerMatched: string | null;
    rawMatchedText: string | null;
    leadCost: string | null;
    leadCostCredits: number | null;
    exactPostedRowFound: boolean;
    postedAt: { seconds: number; nanoseconds: number } | null;
    postedAtIso: string | null;
    postedAtText: string | null;
  };
} {
  const out: CustomerEnquiryData = {};
  const customerCard =
    document.querySelector('[data-tracking-label="Customer"]') ??
    document.querySelector('[data-tracking-label="customer"]') ??
    document.querySelector('[aria-label="customer card"]');
  if (customerCard) {
    const nameEl =
      customerCard.querySelector("p.text-title-sm, p[class*='title'], [class*='text-title']") ?? customerCard.querySelector("p");
    const name = nameEl?.textContent?.trim()?.slice(0, 200);
    if (name) out.customerName = name;
    const phoneEl = customerCard.querySelector('a[data-tracking-label="Customer Phone Number"], a[href^="tel:"]') as HTMLAnchorElement | null;
    if (phoneEl) {
      const p = phoneEl.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? phoneEl.textContent?.trim();
      if (p) out.phone = p;
    }
    const emailEl = customerCard.querySelector('a[data-tracking-label="Customer Email Address"], a[href^="mailto:"]') as HTMLAnchorElement | null;
    if (emailEl) {
      const e = emailEl.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? emailEl.textContent?.trim();
      if (e) out.email = e;
    }
    const addressEl = customerCard.querySelector('a[data-tracking-label="Address link"]');
    const addressText = addressEl?.textContent?.trim() ?? "";
    if (addressText) {
      const m = addressText.match(/^(.+?),?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*,?\s*(\d{4})$/i) ?? addressText.match(/\b(\d{4})\b/);
      if (m) {
        out.postcode = m[2] ?? m[1] ?? "";
        const sub = (m[1] ?? "").replace(/,/g, "").trim();
        out.suburb = sub === out.postcode ? addressText.replace(/\s*,\s*[A-Z]{2,3}\s*,?\s*\d{4}\s*$/i, "").trim().slice(0, 100) : sub.slice(0, 100);
      } else {
        out.suburb = addressText.slice(0, 100);
      }
    }
  }

  // Structured "Lead posted on:" row — exact label + nested time[datetime]
  const postedLabelText = "Lead posted on:";
  let exactPostedRowFound = false;
  let postedAt: { seconds: number; nanoseconds: number } | null = null;
  let postedAtIso: string | null = null;
  let postedAtText: string | null = null;
  const postedCandidates = document.querySelectorAll("span, div, label, p");
  for (const el of postedCandidates) {
    const labelText = (el.textContent ?? "").trim();
    if (labelText !== postedLabelText && !/^Lead\s+posted\s+on\s*:?\s*$/i.test(labelText)) continue;
    const row = el.closest("div") ?? el.parentElement;
    if (!row) continue;
    const timeEl = row.querySelector("time[datetime]");
    const datetimeAttr = timeEl?.getAttribute("datetime")?.trim();
    if (datetimeAttr) {
      const ms = Date.parse(datetimeAttr);
      if (!Number.isNaN(ms)) {
        exactPostedRowFound = true;
        postedAt = { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
        try {
          postedAtIso = new Date(ms).toISOString();
        } catch {
          postedAtIso = datetimeAttr;
        }
        const visible = (timeEl?.textContent ?? "").trim();
        if (visible) postedAtText = visible.slice(0, 100);
        break;
      }
    }
  }
  if (exactPostedRowFound) {
    out.postedAt = postedAt;
    out.postedAtIso = postedAtIso;
    out.postedAtText = postedAtText;
  }

  const mainContent = document.querySelector("main section[class*=\"gap-x-layout-gutter\"]") ?? document.querySelector("main section") ?? document.querySelector("main");
  if (mainContent) {
    const h2Enquiry = Array.from(mainContent.querySelectorAll("h2")).find(
      (h) => (h.textContent ?? "").toLowerCase().includes("customer enquiry")
    );
    if (h2Enquiry) {
      const next = h2Enquiry.nextElementSibling;
      let enquiryText = next?.textContent?.trim().replace(/^\s*customer\s*enquiry\s*:?\s*/i, "").trim().slice(0, 2000) ?? "";
      const badInDescription = /\b(navigation|open in google maps|lead id\s*\d+|settings|mobile menu)\b/i;
      const hasEmailOrPhone = /@|(?:\b04\d{8}\b|\b\d{4}\s*\d{3}\s*\d{3}\b)/;
      if (enquiryText && (badInDescription.test(enquiryText) || (enquiryText.length > 400 && hasEmailOrPhone.test(enquiryText)))) {
        const afterLeadId = enquiryText.match(/lead\s*id\s*\d+\s*([\s\S]+)/i)?.[1]?.trim();
        if (afterLeadId && afterLeadId.length > 15 && !badInDescription.test(afterLeadId)) enquiryText = afterLeadId.slice(0, 2000);
        else if (enquiryText.includes("Customer enquiry")) {
          const afterEnquiry = enquiryText.split(/customer\s*enquiry\s*:?\s*/i).pop()?.trim().slice(0, 2000);
          if (afterEnquiry && afterEnquiry.length > 15) enquiryText = afterEnquiry;
        } else enquiryText = "";
      }
      if (enquiryText) out.description = enquiryText;
    }
    if (!out.description) {
      const descSection = Array.from(mainContent.querySelectorAll("div, section")).find(
        (el) => (el.textContent ?? "").toLowerCase().includes("description") && (el.textContent?.length ?? 0) > 20 && (el.textContent?.length ?? 0) < 3000
      );
      if (descSection) {
        const full = descSection.textContent?.trim() ?? "";
        const desc = full.replace(/description\s*/i, "").trim().slice(0, 2000);
        if (desc) out.description = desc;
      }
    }

    if (!exactPostedRowFound) {
      const postedLabels = Array.from(mainContent.querySelectorAll("label, span, p, dt, th, h2, h3")).filter(
        (el) => /posted|date|received/.test((el.textContent ?? "").trim().toLowerCase())
      );
      for (const label of postedLabels) {
        const next = label.nextElementSibling;
        const text = (next?.textContent ?? "").trim();
        if (text && text.length > 5 && text.length < 80 && !/@|^\d{4}-\d{2}-\d{2}$/.test(text)) {
          out.postedAtText = text.slice(0, 100);
          break;
        }
        const parent = label.closest("div, section");
        if (parent && parent !== mainContent) {
          const full = (parent.textContent ?? "").trim();
          const after = full.replace((label.textContent ?? "").trim(), "").trim().split(/\n/)[0]?.slice(0, 80);
          if (after && after.length > 5) {
            out.postedAtText = after;
            break;
          }
        }
      }
    }
  }
  if (out.postedAt === undefined) out.postedAt = null;
  if (out.postedAtIso === undefined) out.postedAtIso = null;
  if (out.postedAtText === undefined) out.postedAtText = null;

  const title = document.querySelector("h1")?.textContent?.trim()?.slice(0, 500);
  if (title) out.title = title;

  const leadIdMatch = document.body.innerText?.match(/lead\s*id\s*[:\s]*(\d+)/i);
  if (leadIdMatch?.[1]) out.leadId = leadIdMatch[1];

  const costPattern = /(\$[\d,.]+|\d+(?:\.\d+)?\s*credits?)/i;
  const costInText = (text: string): string | null => {
    const m = text.match(costPattern);
    const s = m && (m[1] ?? m[0])?.trim();
    if (!s || s.length >= 30) return null;
    return s;
  };
  const parseCreditsFromRaw = (raw: string): number | null => {
    const cred = /^(\d+(?:\.\d+)?)\s*credits?$/i.exec(raw) ?? /\s+(\d+(?:\.\d+)?)\s*credits?/i.exec(raw);
    if (!cred?.[1]) return null;
    const n = Number(cred[1]);
    return Number.isFinite(n) ? n : null;
  };
  const isVisible = (el: Element): boolean => {
    const h = el as HTMLElement;
    const st = window.getComputedStyle(h);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (Number.parseFloat(st.opacity ?? "1") === 0) return false;
    const r = h.getBoundingClientRect?.();
    return !!r && r.width > 0 && r.height > 0;
  };

  // Primary: structured "Credits for lead:" row (exact label + adjacent value span)
  let structuredCreditsRowFound = false;
  let rawCreditsValue: string | null = null;
  const creditsLabelText = "Credits for lead:";
  const labelCandidates = document.querySelectorAll("span, div, label, p");
  for (const el of labelCandidates) {
    const labelText = (el.textContent ?? "").trim();
    if (labelText !== creditsLabelText && !/^Credits\s+for\s+lead\s*:?\s*$/i.test(labelText)) continue;
    const row = el.closest("div") ?? el.parentElement;
    if (!row) continue;
    const valueSpan = el.nextElementSibling ?? (row.children.length > 1 ? row.children[1] : null);
    const valueText = (valueSpan?.textContent ?? "").trim();
    const num = valueText ? Number(valueText) : NaN;
    if (!Number.isFinite(num) || num < 0) continue;
    structuredCreditsRowFound = true;
    rawCreditsValue = valueText;
    break;
  }

  const costAnchor = document.querySelector(
    "main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]"
  ) as HTMLAnchorElement | null;
  const tried = new Set<Element>();

  type Phase = { label: string; getEls: () => Element[] };
  const phases: Phase[] = [
    {
      label: "expanded-dialog-visible",
      getEls: () =>
        Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => isVisible(d) && !tried.has(d)),
    },
    {
      label: "radix-open-near-cost-card",
      getEls: () => {
        const main = document.querySelector("main");
        if (!costAnchor || !main) return [];
        const cardRoot = costAnchor.closest("[class*='rounded-xl']") ?? costAnchor.parentElement;
        if (!cardRoot) return [];
        return Array.from(main.querySelectorAll('[data-state="open"]')).filter((el) => {
          if (tried.has(el) || !isVisible(el)) return false;
          return (
            el.contains(costAnchor) ||
            el.contains(cardRoot) ||
            (!!cardRoot.nextElementSibling && cardRoot.nextElementSibling.contains(el))
          );
        });
      },
    },
    {
      label: "cost-card-sibling",
      getEls: () => {
        if (!costAnchor) return [];
        const cardRoot = costAnchor.closest("[class*='rounded-xl']") ?? costAnchor.parentElement;
        const els: Element[] = [];
        let sib: Element | null = cardRoot?.nextElementSibling ?? null;
        for (let i = 0; i < 5 && sib; i++) {
          els.push(sib);
          sib = sib.nextElementSibling;
        }
        return els;
      },
    },
    {
      label: "nearest-section-card",
      getEls: () => {
        const els: Element[] = [];
        if (costAnchor) {
          const sec = costAnchor.closest("section");
          if (sec) els.push(sec);
        }
        const costSection = document.querySelector('main section[class*="gap-ml"] div[class*="rounded-xl"]');
        const second = costSection?.children?.[1];
        if (second) els.push(second);
        return els;
      },
    },
    {
      label: "main",
      getEls: () => {
        const m = document.querySelector("main");
        return m && !tried.has(m) ? [m] : [];
      },
    },
    {
      label: "dialog-any",
      getEls: () => Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => !tried.has(d)),
    },
    {
      label: "body",
      getEls: () => (tried.has(document.body) ? [] : [document.body]),
    },
  ];

  let containerMatched: string | null = null;
  let rawMatchedText: string | null = null;
  let leadCost: string | null = null;
  let leadCostCredits: number | null = null;

  if (structuredCreditsRowFound && rawCreditsValue != null) {
    const n = Number(rawCreditsValue);
    if (Number.isFinite(n) && n >= 0) {
      containerMatched = "credits-for-lead-row";
      rawMatchedText = rawCreditsValue;
      leadCostCredits = n;
      leadCost = `${n} credits`;
    }
  }

  if (leadCost == null) {
    outer: for (const phase of phases) {
      for (const el of phase.getEls()) {
        if (tried.has(el)) continue;
        tried.add(el);
        const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
        const raw = costInText(text);
        if (raw) {
          containerMatched = phase.label;
          rawMatchedText = raw;
          leadCost = raw;
          leadCostCredits = parseCreditsFromRaw(raw);
          break outer;
        }
      }
    }
  }

  if (leadCost) {
    out.leadCost = leadCost;
    if (leadCostCredits != null) out.leadCostCredits = leadCostCredits;
    else {
      const n =
        /^(\d+(?:\.\d+)?)\s*credits?$/i.exec(leadCost)?.[1] ??
        /\s+(\d+(?:\.\d+)?)\s*credits?/i.exec(leadCost)?.[1];
      if (n) out.leadCostCredits = Number(n);
    }
  } else {
    out.leadCost = null;
    out.leadCostCredits = null;
  }

  const _costExtractionDebug = {
    costCardClickSucceeded: clickSucceeded,
    structuredCreditsRowFound,
    rawCreditsValue,
    containerMatched,
    rawMatchedText,
    leadCost,
    leadCostCredits,
    exactPostedRowFound,
    postedAt: out.postedAt,
    postedAtIso: out.postedAtIso,
    postedAtText: out.postedAtText,
  };

  const attachments: { url: string; label?: string }[] = [];
  const base = document.baseURI || window.location.origin;
  const resolve = (href: string) => { try { return new URL(href, base).href; } catch { return href; } };
  document.querySelectorAll('a[href*="attachments.hipagesusercontent.com"], a[href*="hipagesusercontent.com"]').forEach((a) => {
    const anchor = a as HTMLAnchorElement;
    const href = anchor.getAttribute("href") ?? anchor.href;
    if (href && !/\/accept|\/decline|\/waitlist/.test(href)) {
      const url = resolve(href);
      const label = anchor.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.textContent?.trim()?.slice(0, 80);
      attachments.push({ url, label: label || undefined });
    }
  });
  if (attachments.length > 0) out.attachments = attachments;

  return { ...out, _costExtractionDebug };
}

/**
 * Scrapes the customer-enquiry page (/jobs/{id}/customer-enquiry). Read-only.
 * Clicks cost card to reveal cost text. Returns null on failure.
 */
export async function scrapeCustomerEnquiryPage(
  page: EnrichmentPage,
  customerEnquiryUrl: string
): Promise<CustomerEnquiryData | null> {
  try {
    let navStatus: number | null = null;
    let domDiag: {
      title: string;
      hasMain: boolean;
      customerCardCount: number;
      costAnchorCount: number;
      creditsLabelInBody: boolean;
      postedLabelInBody: boolean;
      hasLoginKeyword: boolean;
      hasAccessDeniedKeyword: boolean;
      hasLoadingKeyword: boolean;
      hasJobsKeyword: boolean;
      hasCustomerKeyword: boolean;
      bodyTextLength: number;
      hasNextDataScript: boolean;
    };
    const { navStatus: navAfterRetry, gotoAttempts } = await gotoWithStatusRetry(page, customerEnquiryUrl);
    navStatus = navAfterRetry;
    const waitForUrlOk = await page.waitForURL(/\/jobs\/\d+(\/customer-enquiry)?/, { timeout: 10_000 }).then(() => true).catch(() => false);
    const waitForCustomerOk = await page.waitForSelector('[data-tracking-label="Customer"], [aria-label="customer card"]', { timeout: 8_000 }).then(() => true).catch(() => false);
    domDiag = await page.evaluate(() => {
      const customerSelector = '[data-tracking-label="Customer"], [data-tracking-label="customer"], [aria-label="customer card"]';
      const costSelector = "main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]";
      const creditsLabelMatch = document.body.innerText.match(/Credits\s+for\s+lead\s*:?\s*(\d+(?:\.\d+)?)/i);
      const postedLabelMatch = document.body.innerText.match(/Lead\s+posted\s+on\s*:/i);
      const text = (document.body.innerText ?? "").toLowerCase();
      return {
        title: document.title,
        hasMain: !!document.querySelector("main"),
        customerCardCount: document.querySelectorAll(customerSelector).length,
        costAnchorCount: document.querySelectorAll(costSelector).length,
        creditsLabelInBody: !!creditsLabelMatch,
        postedLabelInBody: !!postedLabelMatch,
        hasLoginKeyword: /log in|login|sign in|password|email address/.test(text),
        hasAccessDeniedKeyword: /access denied|forbidden|not authorized|unauthorized|permission/.test(text),
        hasLoadingKeyword: /loading|please wait/.test(text),
        hasJobsKeyword: /job|jobs/.test(text),
        hasCustomerKeyword: /customer|enquiry/.test(text),
        bodyTextLength: (document.body.innerText ?? "").length,
        hasNextDataScript: !!document.querySelector("script#__NEXT_DATA__"),
      };
    });
    const costCardLink = page.locator("main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]").first();
    let costCardClickSucceeded = false;
    await costCardLink.click({ timeout: 4_000 }).then(() => {
      costCardClickSucceeded = true;
    }).catch(() => {});
    await page.waitForTimeout(1_500);
    const raw = await page.evaluate(extractCustomerEnquiryInPage, costCardClickSucceeded);
    const actualPageUrl =
      typeof (page as { url?: () => string }).url === "function"
        ? (page as { url: () => string }).url()
        : "";
    const { _costExtractionDebug: _costDbg, ...data } = raw;
    let merged: CustomerEnquiryData = { ...(data as CustomerEnquiryData) };
    const dbg = _costDbg as
      | {
          leadCost: string | null;
          leadCostCredits: number | null;
          exactPostedRowFound: boolean;
          postedAt: { seconds: number; nanoseconds: number } | null;
          postedAtIso: string | null;
          postedAtText: string | null;
        }
      | undefined;

    const mergedHadValue = Object.values(merged).some(recordHasMeaningfulValue);
    if (
      !mergedHadValue &&
      dbg &&
      (recordHasMeaningfulValue(dbg.leadCost) || dbg.exactPostedRowFound)
    ) {
      merged = {
        ...merged,
        ...(recordHasMeaningfulValue(dbg.leadCost)
          ? { leadCost: dbg.leadCost, leadCostCredits: dbg.leadCostCredits ?? null }
          : {}),
        ...(dbg.exactPostedRowFound
          ? {
              postedAt: dbg.postedAt,
              postedAtIso: dbg.postedAtIso,
              postedAtText: dbg.postedAtText,
            }
          : {}),
      };
    }

    const hasMeaningful = Object.values(merged).some(recordHasMeaningfulValue);
    // #region agent log
    agentDebugLog({
      runId: "run7",
      hypothesisId: "H2",
      location: "hipages-jobs-detail-enrichment.ts:scrapeCustomerEnquiryPage",
      message: "enquiry_extract_snapshot",
      data: {
        url: customerEnquiryUrl,
        navStatus,
        gotoAttempts,
        actualPageUrl,
        waitForUrlOk,
        waitForCustomerOk,
        clickSucceeded: costCardClickSucceeded,
        domDiag,
        rawDataKeyCount: Object.keys(data).length,
        mergedRecoveredFromDbg: !mergedHadValue && hasMeaningful,
        hasCustomerName: !!merged.customerName,
        hasSuburb: !!merged.suburb,
        hasDescription: !!merged.description,
        hasEmail: !!merged.email,
        hasPhone: !!merged.phone,
        hasPostedAt: merged.postedAt != null,
        hasPostedAtIso: !!merged.postedAtIso,
        hasPostedAtText: !!merged.postedAtText,
        leadCost: merged.leadCost ?? null,
        leadCostCredits: merged.leadCostCredits ?? null,
        dbg: _costDbg,
      },
    });
    // #endregion

    return hasMeaningful ? merged : null;
  } catch (e) {
    // #region agent log
    agentDebugLog({
      runId: "run7",
      hypothesisId: "H2",
      location: "hipages-jobs-detail-enrichment.ts:scrapeCustomerEnquiryPage",
      message: "enquiry_detail_catch",
      data: { url: customerEnquiryUrl, error: e instanceof Error ? e.message : String(e) },
    });
    // #endregion
    return null;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export type RunHipagesJobsUpsertOptions = {
  preserveCostWhenMissing?: boolean;
  logger?: (stage: string, data: Record<string, unknown>) => void;
};

export type RunHipagesJobsUpsertResult = {
  totalFound: number;
  saved: number;
  /** Jobs where at least one of main job or customer-enquiry scrape returned data. */
  jobs_detail_enriched_count: number;
  errors: { jobId: string; message: string }[];
};

/**
 * For each job row: scrape `/jobs/{jobId}` then `/jobs/{jobId}/customer-enquiry`, merge, upsert hipages_jobs/{jobId}.
 */
export async function runHipagesJobsEnrichmentAndUpsert(
  page: EnrichmentPage,
  jobRows: HipagesJobListRow[],
  ctx: { sourceId: string },
  options?: RunHipagesJobsUpsertOptions
): Promise<RunHipagesJobsUpsertResult> {
  const preserveCost = options?.preserveCostWhenMissing !== false;
  const log = options?.logger ?? logJobsEnrichment;
  const errors: { jobId: string; message: string }[] = [];
  let saved = 0;
  let jobs_detail_enriched_count = 0;
  let debugLogged = 0;

  for (const row of jobRows) {
    log("hipages_job_upsert_started", { jobId: row.jobId });
    try {
      const existing = await getHipagesJobByIdAdmin(row.jobId);

      const mainUrl = toMainJobDetailUrl(row.jobId);
      let mainDetail: MainJobDetailData | null = null;
      try {
        mainDetail = await scrapeMainJobDetailPage(page, mainUrl);
        if (mainDetail) {
          const fields = Object.keys(mainDetail).filter(
            (k) => mainDetail![k as keyof MainJobDetailData] != null
          );
          log("jobs_detail_enrichment_success", { jobId: row.jobId, fields });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("jobs_detail_enrichment_failed", { jobId: row.jobId, error: msg });
        errors.push({ jobId: row.jobId, message: `main job page: ${msg}` });
      }

      /** Always derive enquiry URL from numeric jobId so it matches the main job URL. */
      const enquiryUrl = toCustomerEnquiryUrl(row.jobId);
      let enquiryDetail: CustomerEnquiryData | null = null;
      try {
        enquiryDetail = await scrapeCustomerEnquiryPage(page, enquiryUrl);
        if (enquiryDetail) {
          const fields = Object.keys(enquiryDetail).filter(
            (k) => enquiryDetail![k as keyof CustomerEnquiryData] != null
          );
          log("customer_enquiry_enrichment_success", { jobId: row.jobId, fields });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("customer_enquiry_enrichment_failed", { jobId: row.jobId, error: msg });
        errors.push({ jobId: row.jobId, message: `customer enquiry: ${msg}` });
      }

      if (mainDetail != null || enquiryDetail != null) {
        jobs_detail_enriched_count++;
      }

      const payload = buildHipagesJobUpsertPayload(
        row,
        mainDetail,
        enquiryDetail,
        existing,
        ctx,
        { preserveCostWhenMissing: preserveCost }
      );
      if (debugLogged < 3) {
        // #region agent log
        agentDebugLog({
          runId: "run2",
          hypothesisId: "H3",
          location: "hipages-jobs-detail-enrichment.ts:runHipagesJobsEnrichmentAndUpsert",
          message: "pre_upsert_merged_payload",
          data: {
            jobId: row.jobId,
            mainIsNull: mainDetail == null,
            enquiryIsNull: enquiryDetail == null,
            list: {
              customerName: !!row.customerName,
              suburb: !!row.suburb,
              title: !!row.title,
              description: !!row.description,
              jobStatus: !!row.jobStatus,
              leadCostFromList: row.leadCostFromList ?? null,
              leadCostCreditsFromList: row.leadCostCreditsFromList ?? null,
              postedAtFromList: row.postedAtFromList != null,
              postedAtIsoFromList: !!row.postedAtIsoFromList,
              postedAtTextFromList: !!row.postedAtTextFromList,
            },
            mainKeys: mainDetail ? Object.keys(mainDetail) : [],
            enquiryKeys: enquiryDetail ? Object.keys(enquiryDetail) : [],
            payload: {
              customerName: !!payload.customerName,
              suburb: !!payload.suburb,
              title: !!payload.title,
              description: !!payload.description,
              fullDescription: !!payload.fullDescription,
              jobStatus: !!payload.jobStatus,
              serviceType: !!payload.serviceType,
              attachmentsCount: payload.attachments?.length ?? 0,
              leadCost: payload.leadCost ?? null,
              leadCostCredits: payload.leadCostCredits ?? null,
              postedAt: payload.postedAt != null,
              postedAtIso: !!payload.postedAtIso,
              postedAtText: !!payload.postedAtText,
              emailPresent: !!payload.email,
              phonePresent: !!payload.phone,
            },
          },
        });
        // #endregion
      }
      await upsertHipagesJobAdmin(row.jobId, payload);
      if (debugLogged < 3) {
        const savedDoc = await getHipagesJobByIdAdmin(row.jobId);
        // #region agent log
        agentDebugLog({
          runId: "run2",
          hypothesisId: "H4",
          location: "hipages-jobs-detail-enrichment.ts:runHipagesJobsEnrichmentAndUpsert",
          message: "post_upsert_saved_doc",
          data: {
            jobId: row.jobId,
            saved: {
              customerName: !!savedDoc?.customerName,
              suburb: !!savedDoc?.suburb,
              title: !!savedDoc?.title,
              description: !!savedDoc?.description,
              fullDescription: !!savedDoc?.fullDescription,
              jobStatus: !!savedDoc?.jobStatus,
              serviceType: !!savedDoc?.serviceType,
              attachmentsCount: Array.isArray(savedDoc?.attachments) ? savedDoc.attachments.length : 0,
              leadCost: savedDoc?.leadCost ?? null,
              leadCostCredits: savedDoc?.leadCostCredits ?? null,
              postedAt: savedDoc?.postedAt != null,
              postedAtIso: !!savedDoc?.postedAtIso,
              postedAtText: !!savedDoc?.postedAtText,
              emailPresent: !!savedDoc?.email,
              phonePresent: !!savedDoc?.phone,
            },
          },
        });
        // #endregion
        debugLogged += 1;
      }
      saved++;
      log("hipages_job_upsert_saved", { jobId: row.jobId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ jobId: row.jobId, message });
      log("hipages_job_upsert_failed", { jobId: row.jobId, error: message });
      console.error(`[hipages-jobs-sync] job ${row.jobId} error:`, message);
    }
  }

  return { totalFound: jobRows.length, saved, jobs_detail_enriched_count, errors };
}
