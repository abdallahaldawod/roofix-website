/**
 * Playwright addInitScript: defines window.__roofixRunMainDetail().
 * Call from Node: page.evaluate("window.__roofixRunMainDetail()").
 */
(() => {
  window.__roofixRunMainDetail = function roofixRunMainDetail() {
  const out = {};
  const main =
    document.querySelector("main") ??
    document.querySelector('[role="main"]') ??
    document.body;

  let diag;
  if (!main) {
    diag = {
      hasRoot: false,
      rootKind: "none",
      customerLabel: 0,
      customerLower: 0,
      ariaCard: 0,
      telInMain: 0,
      mailtoInMain: 0,
    };
    return { extract: out, diag };
  }

  const rootKind =
    main.tagName.toLowerCase() === "main" ? "main" : main.getAttribute("role") === "main" ? "role_main" : "body";
  diag = {
    hasRoot: true,
    rootKind,
    customerLabel: main.querySelectorAll('[data-tracking-label="Customer"]').length,
    customerLower: main.querySelectorAll('[data-tracking-label="customer"]').length,
    ariaCard: main.querySelectorAll('[aria-label="customer card"]').length,
    telInMain: main.querySelectorAll('a[href^="tel:"]').length,
    mailtoInMain: main.querySelectorAll('a[href^="mailto:"]').length,
  };

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

  const serviceLabels = Array.from(main.querySelectorAll("label, span, p, h2, h3")).filter((el) =>
    /service|category|job type/i.test((el.textContent ?? "").trim())
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

  const attachments = [];
  const base = document.baseURI || window.location.origin;
  const resolve = (href) => {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  };
  const gallery = main.querySelector('[data-tracking-label="Thumbnail gallery"]');
  if (gallery) {
    gallery.querySelectorAll("a[href], img[src]").forEach((el) => {
      const url =
        "href" in el && el.href
          ? resolve(el.href)
          : "src" in el && el.src
            ? resolve(el.src)
            : "";
      if (url && !/\/accept|\/decline|\/waitlist/.test(url)) {
        const label =
          "alt" in el && el.alt ? el.alt : el.textContent?.trim()?.slice(0, 80);
        attachments.push({ url, label: label || undefined });
      }
    });
  }
  main
    .querySelectorAll('a[href*="attachments.hipagesusercontent.com"], a[href*="hipagesusercontent.com"]')
    .forEach((a) => {
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

  if (main && (!out.phone || !out.email)) {
    if (!out.phone) {
      const tel = main.querySelector('a[href^="tel:"]');
      const p = tel?.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? tel?.textContent?.trim();
      if (p) out.phone = p;
    }
    if (!out.email) {
      const mail = main.querySelector('a[href^="mailto:"]');
      const e = mail?.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? mail?.textContent?.trim();
      if (e) out.email = e.split("?")[0]?.trim();
    }
  }

  return { extract: out, diag };
  };
})();
