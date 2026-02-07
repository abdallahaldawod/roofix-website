/**
 * Instant conversion tracking (form submissions, call clicks) in Firestore.
 * Used so the Analytics dashboard can show counts without GA4’s 24–48h delay.
 * Server-only; writes to collection "conversions".
 */

import { getAdminFirestore } from "@/lib/firebase/admin";

export type ConversionType = "lead_submit" | "call_click";

const CONVERSIONS_COLLECTION = "conversions";

function dateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a conversion event. No-op if Firestore is not configured.
 * Does not throw; failures are logged only.
 */
export async function recordConversion(
  type: ConversionType,
  location?: string
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    await db.collection(CONVERSIONS_COLLECTION).add({
      type,
      date: dateString(),
      createdAt: new Date(),
      ...(location && { location }),
    });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[conversions] recordConversion failed:", e instanceof Error ? e.message : e);
    }
  }
}

export type ConversionCounts = { lead_submit: number; call_click: number };

/**
 * Get conversion counts for a date range (inclusive). Returns zeros if Firestore unavailable.
 */
export async function getConversionCounts(
  startDate: string,
  endDate: string
): Promise<ConversionCounts> {
  const db = getAdminFirestore();
  if (!db) return { lead_submit: 0, call_click: 0 };
  try {
    const snap = await db
      .collection(CONVERSIONS_COLLECTION)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get();
    const counts: ConversionCounts = { lead_submit: 0, call_click: 0 };
    snap.docs.forEach((doc) => {
      const type = doc.data().type as ConversionType | undefined;
      if (type === "lead_submit") counts.lead_submit += 1;
      else if (type === "call_click") counts.call_click += 1;
    });
    return counts;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[conversions] getConversionCounts failed:", e instanceof Error ? e.message : e);
    }
    return { lead_submit: 0, call_click: 0 };
  }
}
