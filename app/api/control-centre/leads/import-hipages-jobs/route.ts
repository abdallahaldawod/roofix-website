import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import {
  getActivitiesBySourceIdAdmin,
  updateActivityAdmin,
  updateActivityFieldsAdmin,
  writeActivityRecordAdmin,
} from "@/lib/leads/activity-admin";
import type { LeadActivityCreate } from "@/lib/leads/types";

const HIPAGES_JOBS_URL = "https://business.hipages.com.au/jobs?tab=list";
const HIPAGES_BASE = "https://business.hipages.com.au";

function toCustomerEnquiryUrl(href: string): string {
  const m = href.match(/\/jobs\/(\d+)/);
  if (m) return `${HIPAGES_BASE}/jobs/${m[1]}/customer-enquiry`;
  return href.startsWith("http") ? href : new URL(href, HIPAGES_JOBS_URL).href;
}

type JobRow = { href: string; title: string; customerName?: string; suburb?: string; postcode?: string };

/**
 * POST: fetch accepted jobs from hipages jobs list and import as accepted leads.
 * Body: { sourceId: string }
 * - Matches existing lead_activity by sourceId + title → set platformAccepted: true
 * - Creates new lead_activity for jobs that don't match (with platformAccepted: true)
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

  const { sourceId } = (body || {}) as Record<string, unknown>;
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }

  const source = await getSourceByIdAdmin(sourceId.trim());
  if (!source) return NextResponse.json({ ok: false, error: "Source not found" }, { status: 404 });
  if (!source.storageStatePath) {
    return NextResponse.json({ ok: false, error: "Source has no saved session — connect first" }, { status: 400 });
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStorageStatePath(source.storageStatePath);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid session path" }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    await page.goto(HIPAGES_JOBS_URL, { waitUntil: "load", timeout: 25_000 });
    await page.waitForSelector("main a[href*='/jobs/']", { timeout: 15_000 }).catch(() => {});

    const jobRows = await page.evaluate((): JobRow[] => {
      const results: JobRow[] = [];
      const seen = new Set<string>();

      // Cards live under main > section (jobs list). Scope to main so we only open list cards.
      const listRoot = document.querySelector("main") || document;
      const enquiryCards = listRoot.querySelectorAll('[data-tracking-label="Customer Enquiry"]');
      for (const card of enquiryCards) {
        const viewLeadLink = card.querySelector('a[href*="/jobs/"]') as HTMLAnchorElement | null;
        if (!viewLeadLink) continue;
        const href = (viewLeadLink.getAttribute("href") ?? viewLeadLink.href ?? "").trim();
        if (!href || href.includes("/accept") || href.includes("/decline")) continue;
        let fullHref: string;
        try {
          const url = new URL(viewLeadLink.href);
          if (!url.pathname.startsWith("/jobs/")) continue;
          const path = url.pathname;
          if (seen.has(path)) continue;
          seen.add(path);
          fullHref = url.href;
        } catch {
          continue;
        }

        const cardText = (card.textContent ?? "").trim();
        const leadIdEl = card.querySelector("p");
        const leadIdText = leadIdEl?.textContent?.trim() ?? "";
        const descEl = card.querySelector("p.line-clamp-2, p[class*='line-clamp'], .line-clamp-2");
        const descText = (descEl?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
        const title = descText || leadIdText || cardText.split(/\n/)[0]?.trim().slice(0, 200) || "Job";

        let suburb: string | undefined;
        let postcode: string | undefined;
        const postcodeMatch = cardText.match(/\b(\d{4})\b/);
        if (postcodeMatch) {
          postcode = postcodeMatch[1];
          const before = cardText.slice(0, postcodeMatch.index).trim();
          const lastLine = before.split(/\n/).pop()?.trim() ?? "";
          suburb = lastLine.replace(/\s*\d{4}\s*$/, "").replace(/,/g, "").trim().slice(0, 100) || undefined;
        }

        results.push({
          href: fullHref,
          title: title.slice(0, 500),
          suburb,
          postcode,
        });
      }

      // Fallback: any job link in main not already seen
      const links = Array.from(listRoot.querySelectorAll('a[href*="/jobs/"]')) as HTMLAnchorElement[];
      for (const a of links) {
        const href = (a.getAttribute("href") ?? "").trim();
        if (!href || href.includes("/accept") || href.includes("/decline")) continue;
        try {
          const url = new URL(a.href);
          if (!url.pathname.startsWith("/jobs/")) continue;
          if (seen.has(url.pathname)) continue;
          seen.add(url.pathname);
        } catch {
          continue;
        }
        const container = a.closest("tr, [role='row'], article, [class*='card'], [class*='job'], li, div[class]") || a.parentElement;
        const containerText = (container?.textContent ?? "").trim();
        const title = (a.textContent ?? "").trim() || containerText.split(/\n/)[0]?.trim().slice(0, 200) || "Job";
        let suburb: string | undefined;
        let postcode: string | undefined;
        const postcodeMatch = containerText.match(/\b(\d{4})\b/);
        if (postcodeMatch) {
          postcode = postcodeMatch[1];
          const before = containerText.slice(0, postcodeMatch.index).trim();
          const lastLine = before.split(/\n/).pop()?.trim() ?? "";
          suburb = lastLine.replace(/\s*\d{4}\s*$/, "").replace(/,/g, "").trim().slice(0, 100) || undefined;
        }
        results.push({ href: a.href, title: title.slice(0, 500), suburb, postcode });
      }
      return results;
    });

    if (jobRows.length === 0) {
      await browser.close();
      return NextResponse.json({
        ok: true,
        imported: 0,
        updated: 0,
        message: "No jobs found on the list, or the page structure may have changed.",
      });
    }

    const existing = await getActivitiesBySourceIdAdmin(sourceId.trim());
    const normalizedTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
    let updated = 0;
    let imported = 0;

    // Open each card's link (job detail page) and scrape from jobs/{id}/customer-enquiry
    const scrapeJobDetail = async (jobHref: string) => {
      const detailUrl = toCustomerEnquiryUrl(jobHref);
      await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForURL(/\/jobs\/\d+(\/customer-enquiry)?/, { timeout: 10_000 }).catch(() => {});
      await page.waitForSelector('[data-tracking-label="Customer"], [aria-label="customer card"]', { timeout: 8000 }).catch(() => {});
      const costCardLink = page.locator("main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]").first();
      await costCardLink.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return page.evaluate(() => {
        const customerCard =
          document.querySelector('[data-tracking-label="Customer"]') ??
          document.querySelector('[data-tracking-label="customer"]') ??
          document.querySelector('[aria-label="customer card"]');
        let customerName: string | undefined;
        let phone: string | undefined;
        let email: string | undefined;
        let suburb = "";
        let postcode = "";
        if (customerCard) {
          const nameEl =
            customerCard.querySelector("p.text-title-sm, p[class*='title'], [class*='text-title']") ??
            customerCard.querySelector("p");
          customerName = nameEl?.textContent?.trim()?.slice(0, 200) ?? undefined;
          const phoneEl = customerCard.querySelector('a[data-tracking-label="Customer Phone Number"], a[href^="tel:"]') as HTMLAnchorElement | null;
          phone = phoneEl ? (phoneEl.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? phoneEl.textContent?.trim() ?? undefined) : undefined;
          const emailEl = customerCard.querySelector('a[data-tracking-label="Customer Email Address"], a[href^="mailto:"]') as HTMLAnchorElement | null;
          email = emailEl ? (emailEl.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? emailEl.textContent?.trim() ?? undefined) : undefined;
          const addressEl = customerCard.querySelector('a[data-tracking-label="Address link"]');
          const addressText = addressEl?.textContent?.trim() ?? "";
          if (addressText) {
            const m = addressText.match(/^(.+?),?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*,?\s*(\d{4})$/i) ?? addressText.match(/\b(\d{4})\b/);
            if (m) {
              postcode = m[2] ?? m[1] ?? "";
              suburb = (m[1] ?? "").replace(/,/g, "").trim();
              if (suburb === postcode) suburb = addressText.replace(/\s*,\s*[A-Z]{2,3}\s*,?\s*\d{4}\s*$/i, "").trim();
            } else suburb = addressText.slice(0, 100);
          }
        }
        let description: string | undefined;
        const mainContent = document.querySelector("main section[class*=\"gap-x-layout-gutter\"]") ?? document.querySelector("main section") ?? document.querySelector("main");
        if (mainContent) {
          const h2Enquiry = Array.from(mainContent.querySelectorAll("h2")).find(
            (h) => (h.textContent ?? "").toLowerCase().includes("customer enquiry")
          );
          if (h2Enquiry) {
            const next = h2Enquiry.nextElementSibling;
            const enquiryText = next?.textContent?.trim().replace(/^\s*customer\s*enquiry\s*:?\s*/i, "").trim().slice(0, 2000);
            if (enquiryText) description = enquiryText;
          }
          if (!description) {
            const descSection = Array.from(mainContent.querySelectorAll("div, section")).find(
              (el) => (el.textContent ?? "").toLowerCase().includes("description") && (el.textContent?.length ?? 0) > 20 && (el.textContent?.length ?? 0) < 3000
            );
            if (descSection) {
              const full = descSection.textContent?.trim() ?? "";
              description = full.replace(/description\s*/i, "").trim().slice(0, 2000) || undefined;
            }
          }
        }
        const badInDescription = /\b(navigation|open in google maps|lead id\s*\d+|settings|mobile menu)\b/i;
        const hasEmailOrPhone = /@|(?:\b04\d{8}\b|\b\d{4}\s*\d{3}\s*\d{3}\b)/;
        if (description && (badInDescription.test(description) || (description.length > 400 && hasEmailOrPhone.test(description)))) {
          const afterLeadId = description.match(/lead\s*id\s*\d+\s*([\s\S]+)/i)?.[1]?.trim();
          if (afterLeadId && afterLeadId.length > 15 && !badInDescription.test(afterLeadId)) description = afterLeadId.slice(0, 2000);
          else if (description.includes("Customer enquiry")) {
            const afterEnquiry = description.split(/customer\s*enquiry\s*:?\s*/i).pop()?.trim().slice(0, 2000);
            if (afterEnquiry && afterEnquiry.length > 15) description = afterEnquiry;
          } else description = undefined;
        }
        if (description) description = description.slice(0, 2000);
        const title = document.querySelector("h1")?.textContent?.trim()?.slice(0, 500);
        let postedAtText: string | undefined;
        if (mainContent) {
          const postedLabels = Array.from(mainContent.querySelectorAll("label, span, p, dt, th, h2, h3")).filter(
            (el) => /posted|date|received/.test((el.textContent ?? "").trim().toLowerCase())
          );
          for (const label of postedLabels) {
            const next = label.nextElementSibling;
            const text = (next?.textContent ?? "").trim();
            if (text && text.length > 5 && text.length < 80 && !/@|^\d{4}-\d{2}-\d{2}$/.test(text)) {
              postedAtText = text.slice(0, 100);
              break;
            }
            const parent = label.closest("div, section");
            if (parent && parent !== mainContent) {
              const full = (parent.textContent ?? "").trim();
              const after = full.replace((label.textContent ?? "").trim(), "").trim().split(/\n/)[0]?.slice(0, 80);
              if (after && after.length > 5) {
                postedAtText = after;
                break;
              }
            }
          }
        }
        let leadCost: string | undefined;
        const withCredit = Array.from(document.querySelectorAll("main *, [role='dialog'] *")).filter(
          (el) => (el.textContent ?? "").toLowerCase().includes("credit")
        );
        for (const el of withCredit) {
          const costMatch = (el.textContent ?? "").match(/(\d+(?:\.\d+)?\s*credits?|\$[\d,.]+)/i);
          if (costMatch && (costMatch[1] ?? costMatch[0])?.length < 30) {
            leadCost = (costMatch[1] ?? costMatch[0])?.trim();
            break;
          }
        }
        if (!leadCost) {
          const costSection = document.querySelector("main section[class*=\"gap-ml\"] div[class*=\"rounded-xl\"]");
          if (costSection && costSection.children[1]) {
            const costText = (costSection.children[1].textContent ?? "").trim();
            const costMatch = costText.match(/^\$[\d,.]+|^\d+(?:\.\d+)?\s*credits?/i) ?? costText.match(/(\$[\d,.]+|\d+(?:\.\d+)?\s*credits?)\s*-?/i);
            if (costMatch) leadCost = (costMatch[1] ?? costMatch[0])?.trim();
          }
        }
        if (!leadCost) {
          const anyCost = document.body.innerText?.match(/(\$\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*credits?)/i);
          if (anyCost) leadCost = anyCost[1]?.trim();
        }
        return { customerName, email, phone, suburb: suburb || undefined, postcode: postcode || undefined, description, title, leadCost, postedAtText };
      });
    };

    for (const job of jobRows) {
      const key = normalizedTitle(job.title);
      let match = existing.find(({ data }) => normalizedTitle((data.title as string) ?? "") === key);
      if (match) {
        let detail: Awaited<ReturnType<typeof scrapeJobDetail>> | null = null;
        try {
          detail = await scrapeJobDetail(job.href);
        } catch {
          /* use list data only */
        }
        const updates: { platformAccepted: boolean; customerName?: string; email?: string; phone?: string } = { platformAccepted: true };
        if (detail?.customerName) updates.customerName = detail.customerName;
        if (detail?.email) updates.email = detail.email;
        if (detail?.phone) updates.phone = detail.phone;
        await updateActivityFieldsAdmin(match.id, updates);
        const titleMatchJobId = job.href.match(/\/jobs\/(\d+)/)?.[1];
        const platformUpdates: { leadCost?: string; title?: string; description?: string; postedAtText?: string; jobId?: string } = {};
        if (detail?.leadCost) platformUpdates.leadCost = detail.leadCost;
        if (detail?.title) platformUpdates.title = detail.title;
        if (detail?.description) platformUpdates.description = detail.description ?? "";
        if (detail?.postedAtText) platformUpdates.postedAtText = detail.postedAtText;
        if (titleMatchJobId) platformUpdates.jobId = titleMatchJobId;
        if (Object.keys(platformUpdates).length > 0) await updateActivityAdmin(match.id, platformUpdates);
        updated++;
        continue;
      }

      // Match by job id from URL so we don't create duplicates when stored title is short (e.g. "Leads")
      const jobIdFromHref = job.href.match(/\/jobs\/(\d+)/)?.[1];
      if (jobIdFromHref) {
        const jobIdPattern = new RegExp(`\\bjob\\s*${jobIdFromHref}\\b`, "i");
        match = existing.find(({ data }) => jobIdPattern.test((data.title as string) ?? ""));
        if (match) {
          let detail: Awaited<ReturnType<typeof scrapeJobDetail>> | null = null;
          try {
            detail = await scrapeJobDetail(job.href);
          } catch {
            /* use list data only */
          }
          const updates: { platformAccepted: boolean; customerName?: string; email?: string; phone?: string } = { platformAccepted: true };
          if (detail?.customerName) updates.customerName = detail.customerName;
          if (detail?.email) updates.email = detail.email;
          if (detail?.phone) updates.phone = detail.phone;
          await updateActivityFieldsAdmin(match.id, updates);
          const platformUpdates: { leadCost?: string; title?: string; description?: string; postedAtText?: string; jobId?: string } = {};
          if (detail?.leadCost) platformUpdates.leadCost = detail.leadCost;
          if (detail?.title) platformUpdates.title = detail.title;
          if (detail?.description) platformUpdates.description = detail.description ?? "";
          if (detail?.postedAtText) platformUpdates.postedAtText = detail.postedAtText;
          if (jobIdFromHref) platformUpdates.jobId = jobIdFromHref;
          if (Object.keys(platformUpdates).length > 0) await updateActivityAdmin(match.id, platformUpdates);
          updated++;
          continue;
        }
      }

      let detail: Awaited<ReturnType<typeof scrapeJobDetail>> | null = null;
      try {
        detail = await scrapeJobDetail(job.href);
      } catch {
        /* use list data only */
      }

      // Match by customer name to avoid duplicate when same person already has an activity (e.g. title "Leads")
      const customerNameFromDetail = detail?.customerName?.trim().toLowerCase();
      if (customerNameFromDetail) {
        match = existing.find(
          ({ data }) => ((data.customerName as string) ?? "").trim().toLowerCase() === customerNameFromDetail
        );
        if (match) {
          const updates: { platformAccepted: boolean; customerName?: string; email?: string; phone?: string } = { platformAccepted: true };
          if (detail?.customerName) updates.customerName = detail.customerName;
          if (detail?.email) updates.email = detail.email;
          if (detail?.phone) updates.phone = detail.phone;
          await updateActivityFieldsAdmin(match.id, updates);
          const platformUpdates: { leadCost?: string; title?: string; description?: string; postedAtText?: string; jobId?: string } = {};
          if (detail?.leadCost) platformUpdates.leadCost = detail.leadCost;
          if (detail?.title) platformUpdates.title = detail.title;
          if (detail?.description) platformUpdates.description = detail.description ?? "";
          if (detail?.postedAtText) platformUpdates.postedAtText = detail.postedAtText;
          const jid = job.href.match(/\/jobs\/(\d+)/)?.[1];
          if (jid) platformUpdates.jobId = jid;
          if (Object.keys(platformUpdates).length > 0) await updateActivityAdmin(match.id, platformUpdates);
          updated++;
          continue;
        }
      }

      const createJobId = job.href.match(/\/jobs\/(\d+)/)?.[1];
      const create: LeadActivityCreate = {
        title: detail?.title ?? job.title,
        description: detail?.description ?? "",
        sourceId: source.id,
        sourceName: source.name,
        suburb: detail?.suburb ?? job.suburb ?? "",
        postcode: detail?.postcode ?? job.postcode,
        ruleSetId: source.ruleSetId || "unassigned",
        matchedKeywords: [],
        excludedMatched: [],
        score: 0,
        scoreBreakdown: [],
        decision: "Accept",
        status: "Processed",
        timeline: [{ time: new Date().toISOString(), event: "Imported from hipages jobs" }],
        scannedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        platformAccepted: true,
        ...(detail?.customerName ? { customerName: detail.customerName } : {}),
        ...(detail?.email ? { email: detail.email } : {}),
        ...(detail?.phone ? { phone: detail.phone } : {}),
        ...(detail?.leadCost ? { leadCost: detail.leadCost } : {}),
        ...(detail?.postedAtText ? { postedAtText: detail.postedAtText } : {}),
        ...(createJobId ? { jobId: createJobId } : {}),
      };
      const id = await writeActivityRecordAdmin(create);
      if (id) imported++;
    }

    await browser.close();
    browser = undefined;

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: jobRows.length,
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
