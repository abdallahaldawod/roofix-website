import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import { getActivityByIdAdmin, updateActivityFieldsAdmin, updateActivityAdmin } from "@/lib/leads/activity-admin";

const HIPAGES_JOBS_URL = "https://business.hipages.com.au/jobs?tab=list";
const HIPAGES_BASE = "https://business.hipages.com.au";

function jobIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/jobs\/(\d+)/);
  return m ? m[1] : null;
}

function toCustomerEnquiryUrl(href: string): string {
  try {
    const u = new URL(href, HIPAGES_BASE);
    const id = jobIdFromPath(u.pathname);
    if (id) return `${HIPAGES_BASE}/jobs/${id}/customer-enquiry`;
  } catch {
    /* ignore */
  }
  return href;
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
    absolutePath = resolveStorageStatePath(source.storageStatePath);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid session path" }, { status: 400 });
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

    const detailUrl = toCustomerEnquiryUrl(jobHref.startsWith("http") ? jobHref : new URL(jobHref, HIPAGES_BASE).href);
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForURL(/\/jobs\/\d+(\/customer-enquiry)?/, { timeout: 10_000 }).catch(() => {});
    await page.waitForSelector('[data-tracking-label="Customer"], [aria-label="customer card"]', { timeout: 8000 }).catch(() => {});

    const costCardLink = page.locator("main section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]").first();
    await costCardLink.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const extracted = await page.evaluate(() => {
      const customerCard =
        document.querySelector('[data-tracking-label="Customer"]') ??
        document.querySelector('[data-tracking-label="customer"]') ??
        document.querySelector('[aria-label="customer card"]');
      let fromCard: Partial<{ customerName: string; phone: string; email: string; suburb: string; postcode: string }> = {};
      if (customerCard) {
        const nameEl =
          customerCard.querySelector("p.text-title-sm, p[class*='title'], [class*='text-title']") ??
          customerCard.querySelector("p");
        const name = nameEl?.textContent?.trim()?.slice(0, 200);
        const phoneEl = customerCard.querySelector('a[data-tracking-label="Customer Phone Number"], a[href^="tel:"]') as HTMLAnchorElement | null;
        const phone = phoneEl ? (phoneEl.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? phoneEl.textContent?.trim()) : null;
        const emailEl = customerCard.querySelector('a[data-tracking-label="Customer Email Address"], a[href^="mailto:"]') as HTMLAnchorElement | null;
        const email = emailEl ? (emailEl.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? emailEl.textContent?.trim()) : null;
        const addressEl = customerCard.querySelector('a[data-tracking-label="Address link"]');
        const addressText = addressEl?.textContent?.trim() ?? "";
        let suburb = "";
        let postcode = "";
        if (addressText) {
          const match = addressText.match(/^(.+?),?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*,?\s*(\d{4})$/i) ?? addressText.match(/\b(\d{4})\b/);
          if (match) {
            postcode = match[2] ?? match[1] ?? "";
            suburb = (match[1] ?? "").replace(/,/g, "").trim();
            if (suburb === postcode) suburb = addressText.replace(/\s*,\s*[A-Z]{2,3}\s*,?\s*\d{4}\s*$/i, "").trim();
          } else {
            suburb = addressText.slice(0, 100);
          }
        }
        fromCard = { customerName: name ?? undefined, phone: phone ?? undefined, email: email ?? undefined, suburb: suburb || undefined, postcode: postcode || undefined };
      }

      const getLabelValue = (labelText: string): string | null => {
        const labels = Array.from(document.querySelectorAll("label, span, p, dt, th, h2, h3")).filter(
          (el) => (el.textContent ?? "").trim().toLowerCase().includes(labelText.toLowerCase())
        );
        for (const label of labels) {
          const next = label.nextElementSibling;
          const text = next?.textContent?.trim() ?? "";
          const href = (next?.querySelector("a[href^='tel:']") as HTMLAnchorElement)?.href ?? (next?.querySelector("a[href^='mailto:']") as HTMLAnchorElement)?.href;
          if (href) return href.replace(/^tel:/i, "").replace(/^mailto:/i, "").trim();
          if (text && text.length < 500 && !/^\s*$/.test(text)) return text.slice(0, 500);
          const parent = label.closest("div, section, li, article");
          const allText = parent?.textContent?.trim() ?? "";
          const rest = allText.replace((label.textContent ?? "").trim(), "").trim();
          const firstBlock = rest.split(/\n\n/)[0]?.replace(/\n/g, " ").trim().slice(0, 500);
          if (firstBlock) return firstBlock;
        }
        return null;
      };

      const phone = fromCard.phone ?? getLabelValue("phone") ?? getLabelValue("mobile") ?? getLabelValue("contact");
      const email = fromCard.email ?? getLabelValue("email");
      const name = fromCard.customerName ?? getLabelValue("customer") ?? getLabelValue("name") ?? getLabelValue("client");
      const serviceType = getLabelValue("service") ?? getLabelValue("category") ?? getLabelValue("job type");
      const suburb = fromCard.suburb ?? getLabelValue("suburb") ?? getLabelValue("location") ?? getLabelValue("address");
      const postcode = fromCard.postcode ?? getLabelValue("postcode") ?? getLabelValue("post code");
      const mainContent = document.querySelector("main section[class*=\"gap-x-layout-gutter\"]") ?? document.querySelector("main section") ?? document.querySelector("main");
      let postedAtText: string | null = null;
      if (mainContent) {
        const postedLabels = Array.from(mainContent.querySelectorAll("label, span, p, dt, th, h2, h3")).filter(
          (el) => /posted|date|received/.test((el.textContent ?? "").trim().toLowerCase())
        );
        for (const label of postedLabels) {
          const next = label.nextElementSibling;
          const text = (next?.textContent ?? "").trim();
          if (text && text.length > 5 && text.length < 80 && !/^[\d-]+$/.test(text)) {
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
      if (!postedAtText) postedAtText = getLabelValue("posted") ?? getLabelValue("date") ?? getLabelValue("received");
      const title = getLabelValue("title") ?? getLabelValue("job") ?? document.querySelector("h1")?.textContent?.trim()?.slice(0, 500) ?? null;
      let description: string | null = null;
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
          const labels = Array.from(mainContent.querySelectorAll("label, span, p, dt, th, h2, h3")).filter(
            (el) => (el.textContent ?? "").trim().toLowerCase().includes("description")
          );
          for (const label of labels) {
            const next = label.nextElementSibling;
            const text = next?.textContent?.trim() ?? "";
            if (text && text.length > 10 && text.length < 3000) {
              description = text.slice(0, 2000);
              break;
            }
            const parent = label.closest("div, section");
            if (parent && parent.closest("main") === mainContent) {
              const full = parent.textContent?.trim() ?? "";
              const afterLabel = full.replace(/description\s*/i, "").trim().slice(0, 2000);
              if (afterLabel && afterLabel.length > 10) {
                description = afterLabel;
                break;
              }
            }
          }
        }
        if (!description) {
          const descSection = Array.from(mainContent.querySelectorAll("div, section")).find(
            (el) => (el.textContent ?? "").toLowerCase().includes("description") && (el.textContent?.length ?? 0) > 20 && (el.textContent?.length ?? 0) < 3000
          );
          if (descSection) {
            const full = descSection.textContent?.trim() ?? "";
            description = full.replace(/description\s*/i, "").trim().slice(0, 2000) || null;
          }
        }
      }
      if (!description) description = getLabelValue("description") ?? getLabelValue("job description") ?? getLabelValue("details");
      const badInDescription = /\b(navigation|open in google maps|lead id\s*\d+|settings|mobile menu)\b/i;
      const hasEmailOrPhone = /@|(?:\b04\d{8}\b|\b\d{4}\s*\d{3}\s*\d{3}\b)/;
      if (description && (badInDescription.test(description) || (description.length > 400 && hasEmailOrPhone.test(description)))) {
        const afterLeadId = description.match(/lead\s*id\s*\d+\s*([\s\S]+)/i)?.[1]?.trim();
        if (afterLeadId && afterLeadId.length > 15 && !badInDescription.test(afterLeadId)) description = afterLeadId.slice(0, 2000);
        else if (description.includes("Customer enquiry")) {
          const afterEnquiry = description.split(/customer\s*enquiry\s*:?\s*/i).pop()?.trim().slice(0, 2000);
          if (afterEnquiry && afterEnquiry.length > 15) description = afterEnquiry;
        } else description = null;
      }
      if (description) description = description.slice(0, 2000);
      let leadCost: string | undefined;
      // Only set "Free" from cost/credit context (label or section), not from generic page text (e.g. "free quote").
      // 1) Label-based: "Credit" or "Cost" label with value in next sibling or same block
      if (!leadCost) {
        const creditLabel = getLabelValue("credit") ?? getLabelValue("cost") ?? getLabelValue("lead cost");
        if (creditLabel) {
          const normalized = creditLabel.trim();
          if (/^free$/i.test(normalized)) {
            leadCost = "Free";
          } else if (/^\$[\d,.]+$/.test(normalized) || /^\d+(?:\.\d+)?\s*credits?$/i.test(normalized)) {
            leadCost = normalized;
          } else if (/^\d+(?:\.\d+)?$/.test(normalized)) {
            leadCost = `${normalized} credits`;
          } else {
            const fromLabel = normalized.match(/(\$[\d,.]+|\d+(?:\.\d+)?\s*credits?)/i);
            if (fromLabel) leadCost = fromLabel[1]?.trim() ?? fromLabel[0]?.trim();
          }
        }
      }
      // 2) Any element containing "credit" or "cost" with a short cost-like substring
      if (!leadCost) {
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
      }
      if (!leadCost) {
        const costSection = document.querySelector("main section[class*=\"gap-ml\"] div[class*=\"rounded-xl\"]");
        if (costSection && costSection.children[1]) {
          const costText = (costSection.children[1].textContent ?? "").trim();
          const costMatch = costText.match(/^\$[\d,.]+|^\d+(?:\.\d+)?\s*credits?/i) ?? costText.match(/(\$[\d,.]+|\d+(?:\.\d+)?\s*credits?)\s*-?/i);
          if (costMatch) leadCost = costMatch[1]?.trim() ?? costMatch[0]?.trim();
        }
      }
      if (!leadCost) {
        const anyCost = document.body.innerText?.match(/(\$\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*credits?)/i);
        if (anyCost) leadCost = anyCost[1]?.trim();
      }
      return {
        customerName: name ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
        title: title ?? undefined,
        description: description ?? undefined,
        suburb: suburb ?? undefined,
        postcode: postcode ?? undefined,
        serviceType: serviceType ?? undefined,
        postedAtText: postedAtText ?? undefined,
        leadCost: leadCost ?? undefined,
      };
    });

    await browser.close();

    const debugData = {
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
      leadCost: string;
      jobId: string;
    }> = {};
    const resolvedJobId = jobHref ? jobIdFromPath(new URL(jobHref).pathname) : null;
    if (resolvedJobId) platformUpdates.jobId = resolvedJobId;
    if (extracted.title) platformUpdates.title = extracted.title;
    if (extracted.description) platformUpdates.description = extracted.description;
    if (extracted.suburb) platformUpdates.suburb = extracted.suburb;
    if (extracted.postcode) platformUpdates.postcode = extracted.postcode;
    if (extracted.serviceType) platformUpdates.serviceType = extracted.serviceType;
    if (extracted.postedAtText) platformUpdates.postedAtText = extracted.postedAtText;
    if (extracted.leadCost) platformUpdates.leadCost = extracted.leadCost;

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
