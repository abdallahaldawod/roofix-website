/**
 * Env config for APIs.
 * Local: .env.local (explicitly loaded in dev so local deployment always uses it).
 * Production: Google Secret Manager (see apphosting.yaml).
 */

import path from "node:path";
import dotenv from "dotenv";

// In local dev, explicitly load .env.local so the contact form and Places API use local keys.
if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
  dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
}

export function getGooglePlacesApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY;
}

/** Resend API key (contact form). Keys start with re_. Strips BOM, newlines, surrounding quotes. */
export function getResendApiKey(): string | undefined {
  // In dev, ensure .env.local is loaded now (Next.js may not have injected it into this runtime yet)
  if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
    dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });
  }
  const v = process.env.RESEND_API_KEY;
  if (v == null || typeof v !== "string") return undefined;
  const key = v.replace(/\uFEFF/g, "").replace(/[\r\n]/g, "").trim().replace(/^["']|["']$/g, "").trim();
  return key.length > 0 ? key : undefined;
}
