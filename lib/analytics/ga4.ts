/**
 * GA4 tracking helpers. No-op when gtag is not loaded (e.g. no NEXT_PUBLIC_GA4_ID).
 * Use in client components / event handlers only.
 */

declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "js",
      targetId: string,
      config?: Record<string, unknown>
    ) => void;
  }
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === "undefined" || !window.gtag) return;
  const gaId = process.env.NEXT_PUBLIC_GA4_ID;
  if (!gaId) return;
  window.gtag("event", name, params);
}

export function trackLeadSubmit(): void {
  trackEvent("lead_submit");
}

export function trackCallClick(location?: string): void {
  trackEvent("call_click", location ? { location } : undefined);
}

export function trackQuoteClick(location?: string): void {
  trackEvent("quote_click", location ? { location } : undefined);
}
