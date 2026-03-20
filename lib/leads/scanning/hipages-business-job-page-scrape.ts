/**
 * Read-only Playwright helpers for Hipages business job pages (/jobs/{id}, customer-enquiry).
 * Used by fetch-hipages-job to enrich lead_activity (no separate jobs mirror collection).
 */

const HIPAGES_BASE = "https://business.hipages.com.au";

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

export type MainJobDetailData = Partial<{
  title: string;
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
  postedAt: { seconds: number; nanoseconds: number } | null;
  postedAtIso: string | null;
  postedAtText: string | null;
  leadCost: string | null;
  leadCostCredits: number | null;
  attachments: { url: string; label?: string }[];
}>;

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

export type EnrichmentPage = {
  url?: () => string;
  goto: (url: string, opts?: object) => Promise<unknown>;
  waitForURL: (url: RegExp, opts?: { timeout?: number }) => Promise<unknown>;
  waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<unknown>;
  locator: (selector: string) => { first: () => { click: (opts?: { timeout?: number }) => Promise<unknown> } };
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: {
    <T>(fn: () => T): Promise<T>;
    <T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    (expression: string): Promise<unknown>;
  };
};

/**
 * Scrapes the main job detail page (/jobs/{id}). Read-only. Returns null on failure.
 */
export async function scrapeMainJobDetailPage(
  page: EnrichmentPage,
  jobDetailUrl: string
): Promise<MainJobDetailData | null> {
  try {
    await gotoWithStatusRetry(page, jobDetailUrl);
    await page.waitForURL(/\/jobs\/\d+/, { timeout: 10_000 }).then(() => true).catch(() => false);
    await page
      .waitForSelector('main, [role="main"]', { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    const bundle = (await page.evaluate("window.__roofixRunMainDetail()")) as {
      extract: MainJobDetailData;
      diag: Record<string, unknown>;
    };
    const data = bundle?.extract ?? {};
    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
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
    await gotoWithStatusRetry(page, customerEnquiryUrl);
    await page.waitForURL(/\/jobs\/\d+(\/customer-enquiry)?/, { timeout: 10_000 }).then(() => true).catch(() => false);
    await page.waitForSelector('[data-tracking-label="Customer"], [aria-label="customer card"]', { timeout: 8_000 }).then(() => true).catch(() => false);
    await page.evaluate("window.__roofixEnquiryDomDiag()");
    const costCardLink = page.locator("main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]").first();
    let costCardClickSucceeded = false;
    await costCardLink.click({ timeout: 4_000 }).then(() => {
      costCardClickSucceeded = true;
    }).catch(() => {});
    await page.waitForTimeout(1_500);
    await page.evaluate(
      `(() => { window.__roofixHipagesClickOk = ${costCardClickSucceeded ? "true" : "false"}; })()`
    );
    const raw = (await page.evaluate("window.__roofixRunCustomerEnquiry()")) as Record<string, unknown> & {
      _costExtractionDebug: Record<string, unknown>;
    };
    await page.evaluate(`(() => { try { delete window.__roofixHipagesClickOk; } catch (e) {} })()`);
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
    return hasMeaningful ? merged : null;
  } catch {
    return null;
  }
}
