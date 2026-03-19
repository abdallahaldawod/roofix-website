import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveJobsStorageStateAbsolute } from "@/lib/leads/connection/session-persistence";
import { getActivityByIdAdmin, updateActivityFieldsAdmin, updateActivityAdmin } from "@/lib/leads/activity-admin";
import {
  scrapeCustomerEnquiryPage,
  scrapeMainJobDetailPage,
  toCustomerEnquiryUrl as toEnquiryUrl,
  toMainJobDetailUrl,
  type EnrichmentPage,
} from "@/lib/leads/scanning/hipages-jobs-detail-enrichment";

const HIPAGES_JOBS_URL = "https://business.hipages.com.au/jobs?tab=list";
const HIPAGES_BASE = "https://business.hipages.com.au";

function jobIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/jobs\/(\d+)/);
  return m ? m[1] : null;
}

function toCustomerEnquiryUrl(href: string): string {
  return toEnquiryUrl(href);
}

/**
 * POST: fetch customer contact info from the hipages job (for an accepted lead)
 * and save it to the lead activity. Body: { sourceId: string; leadId: string }
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceId, leadId, jobDetailUrl } = (body || {}) as Record<string, unknown>;
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }
  if (typeof leadId !== "string" || !leadId.trim()) {
    return NextResponse.json({ ok: false, error: "leadId is required" }, { status: 400 });
  }

  const activity = await getActivityByIdAdmin(leadId.trim());
  if (!activity) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const source = await getSourceByIdAdmin(sourceId.trim());
  if (!source) return NextResponse.json({ ok: false, error: "Source not found" }, { status: 404 });
  if (!source.storageStatePath) {
    return NextResponse.json({ ok: false, error: "Source has no saved session — connect first" }, { status: 400 });
  }

  let absolutePath: string;
  try {
    absolutePath = resolveJobsStorageStateAbsolute(source);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid session path or no jobs session file." },
      { status: 400 }
    );
  }

  let jobHref: string | null = null;
  if (typeof jobDetailUrl === "string" && jobDetailUrl.trim()) {
    try {
      const u = new URL(jobDetailUrl.trim());
      if (u.hostname === "business.hipages.com.au" && u.pathname.startsWith("/jobs/") && !u.pathname.includes("/accept") && !u.pathname.includes("/decline")) {
        jobHref = u.href;
      }
    } catch {
      /* ignore */
    }
  }

  const searchTitle = (activity.title as string)?.trim() ?? "";
  const searchCustomer = (activity.customerName as string)?.trim() ?? "";
  const activityJobId = typeof activity.jobId === "string" && activity.jobId.trim() ? activity.jobId.trim() : null;
  if (!jobHref && !activityJobId && [searchTitle, searchCustomer].filter(Boolean).length === 0) {
    return NextResponse.json({ ok: false, error: "Lead has no title or customer name to match job" }, { status: 400 });
  }

  if (activityJobId && !jobHref) {
    jobHref = `${HIPAGES_BASE}/jobs/${activityJobId}/customer-enquiry`;
  }
  const jobNumMatch = searchTitle.match(/Job\s*(\d+)/i);
  if (jobNumMatch && !jobHref) {
    jobHref = `${HIPAGES_BASE}/jobs/${jobNumMatch[1]}/customer-enquiry`;
  }
  const shortTerms: string[] = [];
  if (jobNumMatch) shortTerms.push("Job " + jobNumMatch[1]);
  if (searchTitle.length > 0) shortTerms.push(searchTitle.slice(0, 80));
  if (searchTitle.length > 80) shortTerms.push(searchTitle.slice(0, 150));
  if (searchCustomer) shortTerms.push(searchCustomer);
  const searchTerms = [...new Set(shortTerms)].filter(Boolean);

  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

      if (!jobHref) {
      await page.goto(HIPAGES_JOBS_URL, { waitUntil: "load", timeout: 25_000 });
      await page.waitForSelector("main a[href*='/jobs/']", { timeout: 15_000 }).catch(() => {});

      const listHref = await page.evaluate((terms: string[]) => {
        const listRoot = document.querySelector("main") || document;
        const enquiryCards = listRoot.querySelectorAll('[data-tracking-label="Customer Enquiry"]');
        for (const card of enquiryCards) {
          const cardText = (card.textContent ?? "").toLowerCase();
          if (terms.length > 0 && !terms.some((t) => t && cardText.includes(t.toLowerCase()))) continue;
          const viewLeadLink = card.querySelector('a[href*="/jobs/"]') as HTMLAnchorElement | null;
          if (!viewLeadLink) continue;
          const href = viewLeadLink.getAttribute("href") ?? viewLeadLink.href ?? "";
          if (href.includes("/accept") || href.includes("/decline")) continue;
          try {
            const url = new URL(viewLeadLink.href);
            if (url.pathname.startsWith("/jobs/") && url.pathname.length > 6) return url.href;
          } catch {
            /* ignore */
          }
        }
        const links = Array.from(listRoot.querySelectorAll('a[href*="/jobs/"]')) as HTMLAnchorElement[];
        for (const a of links) {
          const href = a.getAttribute("href") ?? "";
          if (href.includes("/accept") || href.includes("/decline")) continue;
          const container = a.closest("tr, [role='row'], article, [class*='card'], [class*='job']") || a;
          const text = (container.textContent ?? "").toLowerCase();
          if (terms.some((t) => t && text.includes(t.toLowerCase()))) {
            try {
              const url = new URL(a.href);
              if (url.pathname.startsWith("/jobs/")) return a.href;
            } catch {
              /* ignore */
            }
          }
        }
        return null;
      }, searchTerms);

      if (listHref) jobHref = toCustomerEnquiryUrl(listHref);
      if (!jobHref) {
        await browser.close();
        return NextResponse.json({
          ok: false,
          error: "Could not find a matching job on the jobs list. The lead may not be accepted yet or the list structure changed.",
        });
      }
    }

    const jobAbsoluteHref = jobHref.startsWith("http") ? jobHref : new URL(jobHref, HIPAGES_BASE).href;
    const hipagesJobId = jobIdFromPath(new URL(jobAbsoluteHref).pathname);
    if (!hipagesJobId) {
      await browser.close();
      return NextResponse.json(
        { ok: false, error: "Could not determine Hipages job id from URL" },
        { status: 400 }
      );
    }

    const mainJobUrl = toMainJobDetailUrl(hipagesJobId);
    const customerEnquiryUrl = toEnquiryUrl(hipagesJobId);

    const mainDetail = await scrapeMainJobDetailPage(page as EnrichmentPage, mainJobUrl);
    const enquiryData = await scrapeCustomerEnquiryPage(page as EnrichmentPage, customerEnquiryUrl);

    await browser.close();

    const enq = enquiryData ?? {};
    const main = mainDetail ?? {};
    /** Main job page: title/service/attachments + enquiry body when enquiry URL omits it; customer-enquiry: cost/posted. */
    const extracted = {
      customerName: enq.customerName ?? main.customerName,
      email: enq.email ?? main.email,
      phone: enq.phone ?? main.phone,
      title: enq.title ?? main.title,
      description: enq.description ?? main.description,
      suburb: enq.suburb ?? main.suburb,
      postcode: enq.postcode ?? main.postcode,
      postedAtText: enq.postedAtText,
      leadCost: enq.leadCost,
      leadCostCredits: enq.leadCostCredits,
      serviceType: main.serviceType,
    };

    // #region agent log
    fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b3ba84" },
      body: JSON.stringify({
        sessionId: "b3ba84",
        runId: "fetch-job-route",
        hypothesisId: "H5",
        location: "fetch-hipages-job/route.ts:POST",
        message: "fetch_hipages_extracted_fields",
        data: {
          mainKeys: Object.keys(main),
          enqKeys: Object.keys(enq),
          hasMainDesc: !!(main as { description?: string }).description,
          hasEnqDesc: !!enq.description,
          hasMergedDesc: !!(extracted as { description?: string }).description,
          hasMainTitle: !!main.title,
          hasEnqTitle: !!enq.title,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const debugData = {
      hipagesJobId,
      mainJobPath: `/jobs/${hipagesJobId}`,
      customerEnquiryPath: `/jobs/${hipagesJobId}/customer-enquiry`,
      hasMainDetail: !!mainDetail,
      hasEnquiryDetail: !!enquiryData,
      jobPath: jobHref?.replace(/^https?:\/\/[^/]+/, "") ?? "",
      hasCustomerName: !!extracted.customerName,
      hasEmail: !!extracted.email,
      hasPhone: !!extracted.phone,
      hasDescription: !!extracted.description,
      descriptionLen: extracted.description?.length ?? 0,
    };

    const contactUpdates: Partial<{ customerName: string; email: string; phone: string }> = {};
    if (extracted.customerName) contactUpdates.customerName = extracted.customerName;
    if (extracted.email) contactUpdates.email = extracted.email;
    if (extracted.phone) contactUpdates.phone = extracted.phone;

    if (Object.keys(contactUpdates).length > 0) {
      await updateActivityFieldsAdmin(leadId.trim(), contactUpdates);
    }

    const platformUpdates: Partial<{
      title: string;
      description: string;
      suburb: string;
      postcode: string;
      serviceType: string;
      postedAtText: string;
      leadCost: string | null;
      leadCostCredits: number | null;
      jobId: string;
    }> = {};
    platformUpdates.jobId = hipagesJobId;
    if (extracted.title) platformUpdates.title = extracted.title;
    if (extracted.description) platformUpdates.description = extracted.description;
    if (extracted.suburb) platformUpdates.suburb = extracted.suburb;
    if (extracted.postcode) platformUpdates.postcode = extracted.postcode;
    if (extracted.serviceType) platformUpdates.serviceType = extracted.serviceType;
    if (extracted.postedAtText) platformUpdates.postedAtText = extracted.postedAtText;
    if (extracted.leadCost != null && String(extracted.leadCost).trim() !== "") platformUpdates.leadCost = extracted.leadCost;
    if (extracted.leadCostCredits != null && Number.isFinite(extracted.leadCostCredits)) platformUpdates.leadCostCredits = extracted.leadCostCredits;

    if (Object.keys(platformUpdates).length > 0) {
      await updateActivityAdmin(leadId.trim(), platformUpdates);
    }

    return NextResponse.json({
      ok: true,
      customerName: contactUpdates.customerName ?? activity.customerName,
      email: contactUpdates.email ?? activity.email,
      phone: contactUpdates.phone ?? activity.phone,
      title: platformUpdates.title ?? activity.title,
      description: platformUpdates.description ?? activity.description,
      suburb: platformUpdates.suburb ?? activity.suburb,
      postcode: platformUpdates.postcode ?? activity.postcode,
      serviceType: platformUpdates.serviceType ?? activity.serviceType,
      postedAtText: platformUpdates.postedAtText ?? activity.postedAtText,
      leadCost: platformUpdates.leadCost ?? activity.leadCost,
      leadCostCredits: platformUpdates.leadCostCredits ?? activity.leadCostCredits,
      _debug: debugData,
    });
  } catch (e) {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
