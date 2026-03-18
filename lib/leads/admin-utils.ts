/**
 * Server-only helpers for Admin Firestore lead services.
 * Normalises Firestore Timestamp from Admin SDK to FsTimestamp.
 */

import type { FsTimestamp } from "./types";

/**
 * Recursively removes `undefined` values from an object before writing to Firestore.
 * The Admin SDK throws "Unsupported field value: undefined" — use this on every payload.
 */
export function stripUndefined<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripUndefined(value as object);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/** Convert Firestore Admin Timestamp (or plain { seconds, nanoseconds }) to FsTimestamp. */
export function toFsTimestamp(
  v: unknown
): FsTimestamp | null {
  if (v === null || v === undefined) return null;
  if (
    typeof v === "object" &&
    v !== null &&
    "seconds" in v &&
    "nanoseconds" in v
  ) {
    const t = v as { seconds: number; nanoseconds: number };
    if (typeof t.seconds === "number" && typeof t.nanoseconds === "number") {
      return { seconds: t.seconds, nanoseconds: t.nanoseconds };
    }
  }
  return null;
}
