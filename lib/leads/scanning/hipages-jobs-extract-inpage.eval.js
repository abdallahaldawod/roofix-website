/**
 * Single expression for Playwright page.evaluate(string). Plain JS only — not bundled.
 * Path: lib/leads/scanning/hipages-jobs-extract-inpage.eval.js
 */
(() => {
  const normalizeText = (s, maxLen) => {
    if (s == null || typeof s !== "string") return null;
    const t = s.trim().replace(/\s+/g, " ");
    if (!t) return null;
    return t.length > maxLen ? t.slice(0, maxLen) : t;
  };

  const normalizeDescription = (s, maxLen) => {
    if (s == null || typeof s !== "string") return null;
    const t = s.trim().replace(/\s+/g, " ").replace(/\n+/g, " ");
    if (!t) return null;
    return t.length > maxLen ? t.slice(0, maxLen) : t;
  };

  const listExtrasFromContainer = (container) => {
    let postedAtFromList = null;
    let postedAtIsoFromList = null;
    let postedAtTextFromList = null;
    const timeEl = container.querySelector("time[datetime]");
    if (timeEl) {
      const dt = timeEl.getAttribute("datetime")?.trim();
      if (dt) {
        const ms = Date.parse(dt);
        if (!Number.isNaN(ms)) {
          postedAtFromList = { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
          try {
            postedAtIsoFromList = new Date(ms).toISOString();
          } catch {
            postedAtIsoFromList = dt;
          }
        }
      }
      const vis = (timeEl.textContent ?? "").trim();
      if (vis) postedAtTextFromList = vis.slice(0, 100);
    }

    const parseCredits = (raw) => {
      const cred =
        /^(\d+(?:\.\d+)?)\s*credits?$/i.exec(raw.trim()) ?? /\s+(\d+(?:\.\d+)?)\s*credits?/i.exec(raw);
      if (!cred?.[1]) return null;
      const n = Number(cred[1]);
      return Number.isFinite(n) ? n : null;
    };
    const footer = container.querySelector("footer");
    const costHaystack = (footer?.textContent ?? container.textContent ?? "").replace(/\s+/g, " ");
    let leadCostFromList = null;
    let leadCostCreditsFromList = null;
    const dollar = costHaystack.match(/\$\s*[\d,.]+/);
    const credM = costHaystack.match(/\b(\d+(?:\.\d+)?)\s*credits?\b/i);
    if (dollar?.[0]) {
      leadCostFromList = dollar[0].replace(/\s/g, "");
    } else if (credM?.[0]) {
      leadCostFromList = credM[0].trim();
      leadCostCreditsFromList = parseCredits(leadCostFromList);
    }

    return {
      postedAtFromList,
      postedAtIsoFromList,
      postedAtTextFromList,
      leadCostFromList,
      leadCostCreditsFromList,
    };
  };

  const results = [];
  const seen = new Set();

  const rowItems = Array.from(document.querySelectorAll('li[aria-label="Jobs list item"]'));

  for (const row of rowItems) {
    const jobLink = row.querySelector('a[data-tracking-label="Job"]');
    if (!jobLink) continue;

    const rawHref = (jobLink.getAttribute("href") ?? jobLink.href ?? "").trim();
    if (!rawHref || rawHref.includes("/accept") || rawHref.includes("/decline")) continue;

    let fullHref;
    let jobId;
    try {
      const url = new URL(jobLink.href);
      if (!url.pathname.startsWith("/jobs/")) continue;
      const match = url.pathname.match(/\/jobs\/(\d+)/);
      if (!match?.[1]) continue;
      jobId = match[1];
      if (seen.has(jobId)) continue;
      seen.add(jobId);
      fullHref = url.href;
    } catch {
      continue;
    }

    const card = jobLink.querySelector('div[data-tracking-label="Job list item"]') ?? jobLink;

    const header = card.querySelector("header");
    let customerName = null;
    let suburb = null;
    if (header) {
      const headerPs = Array.from(header.querySelectorAll("p"));
      const customerNameP = headerPs.find((p) => {
        const t = (p.textContent ?? "").trim();
        return t.length > 0 && !/^Job\s*\d+$/i.test(t);
      });
      customerName = normalizeText(customerNameP?.textContent, 200);

      const suburbSpan =
        header.querySelector(
          'span.text-content-link.text-body-emphasis, span[class*="text-content-link"][class*="text-body-emphasis"]'
        ) ??
        header.querySelector("span.text-content-link") ??
        header.querySelector("span[class*='text-body-emphasis']");
      suburb = normalizeText(suburbSpan?.textContent, 150);
    }

    const titleEl =
      card.querySelector('p.mb-xs.text-content.line-clamp-1, p.mb-xs[class*="line-clamp-1"]') ??
      card.querySelector('p[class*="mb-xs"][class*="line-clamp-1"]') ??
      card.querySelector('p.line-clamp-1, p[class*="line-clamp-1"]') ??
      card.querySelector(
        'p[class*="text-body-sm-emphasis"][class*="line-clamp-1"], p[class*="text-body-emphasis"][class*="line-clamp-1"]'
      );
    const title = normalizeText(titleEl?.textContent, 500);

    const descriptionEl =
      card.querySelector('p.text-content.line-clamp-2, p[class*="line-clamp-2"]') ??
      card.querySelector('p[class*="text-body-sm"][class*="line-clamp-2"], p[class*="text-body"][class*="line-clamp-2"]');
    const description = normalizeDescription(descriptionEl?.textContent, 2000);

    const statusBtn = card.querySelector('button[aria-label="Job status"]');
    const jobStatus = normalizeText(statusBtn?.textContent, 100);

    const createQuoteBtn = Array.from(card.querySelectorAll("button, a")).find(
      (el) => (el.textContent ?? "").trim().toLowerCase() === "create quote"
    );
    const canCreateQuote = !!createQuoteBtn && createQuoteBtn.offsetParent !== null;

    const extras = listExtrasFromContainer(row);

    results.push({
      jobId,
      href: fullHref,
      sourceName: "Hipages",
      customerName,
      suburb,
      title,
      description,
      jobStatus,
      canCreateQuote,
      ...extras,
    });
  }

  if (results.length > 0) return results;

  const listRoot = document.querySelector("main") || document;
  const enquiryCards = listRoot.querySelectorAll('[data-tracking-label="Customer Enquiry"]');
  for (const card of enquiryCards) {
    const viewLeadLink = card.querySelector('a[href*="/jobs/"]');
    if (!viewLeadLink) continue;
    const href = (viewLeadLink.getAttribute("href") ?? viewLeadLink.href ?? "").trim();
    if (!href || href.includes("/accept") || href.includes("/decline")) continue;
    let fullHref;
    let jobId;
    try {
      const url = new URL(viewLeadLink.href);
      if (!url.pathname.startsWith("/jobs/")) continue;
      const match = url.pathname.match(/\/jobs\/(\d+)/);
      if (!match?.[1]) continue;
      jobId = match[1];
      if (seen.has(jobId)) continue;
      seen.add(jobId);
      fullHref = url.href;
    } catch {
      continue;
    }
    const titleEl =
      card.querySelector('p.line-clamp-1, p[class*="line-clamp-1"], p.mb-xs, p[class*="text-body-sm-emphasis"]');
    const descriptionEl =
      card.querySelector('p[class*="line-clamp-2"]') ?? Array.from(card.querySelectorAll("p"))[1];
    const title = normalizeText(titleEl?.textContent ?? Array.from(card.querySelectorAll("p"))[0]?.textContent, 500);
    const description = normalizeDescription(descriptionEl?.textContent, 2000);
    const statusBtn = card.querySelector('button[aria-label="Job status"]');
    const jobStatus = normalizeText(statusBtn?.textContent, 100);
    const createQuoteBtn = Array.from(card.querySelectorAll("button, a")).find(
      (el) => (el.textContent ?? "").trim().toLowerCase() === "create quote"
    );
    const canCreateQuote = !!createQuoteBtn;
    const header = card.querySelector("header");
    const headerPs = header ? Array.from(header.querySelectorAll("p")) : [];
    const customerNameP = headerPs.find((p) => {
      const t = (p.textContent ?? "").trim();
      return t.length > 0 && !/^Job\s*\d+$/i.test(t);
    });
    const suburbSpan = header?.querySelector("span.text-content-link, span[class*='text-body-emphasis']");
    const extras = listExtrasFromContainer(card);
    results.push({
      jobId,
      href: fullHref,
      sourceName: "Hipages",
      customerName: normalizeText(customerNameP?.textContent, 200),
      suburb: normalizeText(suburbSpan?.textContent, 150),
      title,
      description,
      jobStatus,
      canCreateQuote,
      ...extras,
    });
  }
  return results;
})()
