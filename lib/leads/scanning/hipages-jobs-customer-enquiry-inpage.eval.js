/**
 * Playwright addInitScript: window.__roofixEnquiryDomDiag(), window.__roofixRunCustomerEnquiry().
 * Set window.__roofixHipagesClickOk before __roofixRunCustomerEnquiry().
 */
(() => {
  window.__roofixEnquiryDomDiag = function roofixEnquiryDomDiag() {
    const customerSelector =
      '[data-tracking-label="Customer"], [data-tracking-label="customer"], [aria-label="customer card"]';
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
  };
  window.__roofixRunCustomerEnquiry = function roofixRunCustomerEnquiry() {
  const clickSucceeded = window.__roofixHipagesClickOk === true;
  const pageRoot =
    document.querySelector("main") ??
    document.querySelector('[role="main"]') ??
    document.body;

  const out = {};
  const customerCard =
    document.querySelector('[data-tracking-label="Customer"]') ??
    document.querySelector('[data-tracking-label="customer"]') ??
    document.querySelector('[aria-label="customer card"]');
  if (customerCard) {
    const nameEl =
      customerCard.querySelector("p.text-title-sm, p[class*='title'], [class*='text-title']") ??
      customerCard.querySelector("p");
    const name = nameEl?.textContent?.trim()?.slice(0, 200);
    if (name) out.customerName = name;
    const phoneEl = customerCard.querySelector('a[data-tracking-label="Customer Phone Number"], a[href^="tel:"]');
    if (phoneEl) {
      const p = phoneEl.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? phoneEl.textContent?.trim();
      if (p) out.phone = p;
    }
    const emailEl = customerCard.querySelector('a[data-tracking-label="Customer Email Address"], a[href^="mailto:"]');
    if (emailEl) {
      const e = emailEl.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? emailEl.textContent?.trim();
      if (e) out.email = e;
    }
    const addressEl = customerCard.querySelector('a[data-tracking-label="Address link"]');
    const addressText = addressEl?.textContent?.trim() ?? "";
    if (addressText) {
      const m =
        addressText.match(/^(.+?),?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*,?\s*(\d{4})$/i) ??
        addressText.match(/\b(\d{4})\b/);
      if (m) {
        out.postcode = m[2] ?? m[1] ?? "";
        const sub = (m[1] ?? "").replace(/,/g, "").trim();
        out.suburb =
          sub === out.postcode
            ? addressText.replace(/\s*,\s*[A-Z]{2,3}\s*,?\s*\d{4}\s*$/i, "").trim().slice(0, 100)
            : sub.slice(0, 100);
      } else {
        out.suburb = addressText.slice(0, 100);
      }
    }
  }

  const mainEl = pageRoot;
  if (mainEl && (!out.phone || !out.email)) {
    if (!out.phone) {
      const tel = mainEl.querySelector('a[href^="tel:"]');
      const p = tel?.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? tel?.textContent?.trim();
      if (p) out.phone = p;
    }
    if (!out.email) {
      const mail = mainEl.querySelector('a[href^="mailto:"]');
      const e = mail?.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? mail?.textContent?.trim();
      if (e) out.email = e.split("?")[0]?.trim();
    }
  }

  const postedLabelText = "Lead posted on:";
  let exactPostedRowFound = false;
  let postedAt = null;
  let postedAtIso = null;
  let postedAtText = null;
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

  const enquiryRoot = pageRoot;
  const mainContent =
    enquiryRoot?.querySelector('section[class*="gap-x-layout-gutter"]') ??
    enquiryRoot?.querySelector("section") ??
    enquiryRoot;
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

    if (!exactPostedRowFound) {
      const postedLabels = Array.from(mainContent.querySelectorAll("label, span, p, dt, th, h2, h3")).filter((el) =>
        /posted|date|received/.test((el.textContent ?? "").trim().toLowerCase())
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
  const costInText = (text) => {
    const m = text.match(costPattern);
    const s = m && (m[1] ?? m[0])?.trim();
    if (!s || s.length >= 30) return null;
    return s;
  };
  const parseCreditsFromRaw = (raw) => {
    const cred = /^(\d+(?:\.\d+)?)\s*credits?$/i.exec(raw) ?? /\s+(\d+(?:\.\d+)?)\s*credits?/i.exec(raw);
    if (!cred?.[1]) return null;
    const n = Number(cred[1]);
    return Number.isFinite(n) ? n : null;
  };
  const isVisible = (el) => {
    const h = el;
    const st = window.getComputedStyle(h);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (Number.parseFloat(st.opacity ?? "1") === 0) return false;
    const r = h.getBoundingClientRect?.();
    return !!r && r.width > 0 && r.height > 0;
  };

  let structuredCreditsRowFound = false;
  let rawCreditsValue = null;
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

  const costAnchor = pageRoot?.querySelector(
    "section[class*='gap-x-layout-gutter'] div.rounded-xl.text-content a[href]"
  );
  const tried = new Set();

  const phases = [
    {
      label: "expanded-dialog-visible",
      getEls: () =>
        Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => isVisible(d) && !tried.has(d)),
    },
    {
      label: "radix-open-near-cost-card",
      getEls: () => {
        const m = pageRoot;
        if (!costAnchor || !m) return [];
        const cardRoot = costAnchor.closest("[class*='rounded-xl']") ?? costAnchor.parentElement;
        if (!cardRoot) return [];
        return Array.from(m.querySelectorAll('[data-state="open"]')).filter((el) => {
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
        const els = [];
        let sib = cardRoot?.nextElementSibling ?? null;
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
        const els = [];
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
        const m = pageRoot;
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

  let containerMatched = null;
  let rawMatchedText = null;
  let leadCost = null;
  let leadCostCredits = null;

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
        const text = el.innerText ?? el.textContent ?? "";
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

  const attachments = [];
  const base = document.baseURI || window.location.origin;
  const resolve = (href) => {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  };
  document.querySelectorAll('a[href*="attachments.hipagesusercontent.com"], a[href*="hipagesusercontent.com"]').forEach((a) => {
    const anchor = a;
    const href = anchor.getAttribute("href") ?? anchor.href;
    if (href && !/\/accept|\/decline|\/waitlist/.test(href)) {
      const url = resolve(href);
      const label =
        anchor.querySelector("img[alt]")?.getAttribute("alt") ?? anchor.textContent?.trim()?.slice(0, 80);
      if (url) attachments.push({ url, label: label || undefined });
    }
  });
  if (attachments.length > 0) out.attachments = attachments;

  return { ...out, _costExtractionDebug };
  };
})();
