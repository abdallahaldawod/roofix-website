"use server";

import { deleteSourceAdmin } from "@/lib/leads/sources-admin";
import { deleteSource } from "@/lib/leads/sources";

/** Delete a source (server-only). Blocks deletion of system sources. */
export async function deleteSourceAndCredentials(
  sourceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await deleteSourceAdmin(sourceId);
    return result;
  } catch (e) {
    // Fall back to client-side delete if admin SDK is unavailable
    try {
      await deleteSource(sourceId);
      return { ok: true };
    } catch {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  }
}
