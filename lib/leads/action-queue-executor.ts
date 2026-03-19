/**
 * Server-only: execute a single queued lead action locally using Playwright.
 * For use by the local PM2 worker only; do not call from production hosting.
 */

import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { performHipagesAction } from "@/lib/leads/hipages-action";
import type { LeadActionQueueDocument } from "@/lib/leads/action-queue-types";

const SUPPORTED_ACTIONS = ["accept", "decline", "waitlist"] as const;

export type ExecuteQueuedActionResult =
  | { ok: true; resultSummary?: string }
  | { ok: false; error: string };

/**
 * Execute one queued action using the source's saved Playwright session.
 * Validates source and session; calls performHipagesAction. Does not update queue status.
 */
export async function executeQueuedAction(
  doc: LeadActionQueueDocument
): Promise<ExecuteQueuedActionResult> {
  const { id: _queueId, sourceId, leadId, action, actionPath } = doc;

  if (!sourceId?.trim()) {
    return { ok: false, error: "Missing sourceId" };
  }
  if (!actionPath?.trim() || !actionPath.startsWith("/leads/")) {
    return { ok: false, error: "Invalid or missing actionPath" };
  }
  if (!SUPPORTED_ACTIONS.includes(action)) {
    return { ok: false, error: `Unsupported action: ${action}` };
  }

  const source = await getSourceByIdAdmin(sourceId.trim());
  if (!source) {
    return { ok: false, error: "Source not found" };
  }
  if (!source.storageStatePath?.trim()) {
    return { ok: false, error: "Source has no saved session — connect first" };
  }

  const result = await performHipagesAction({
    sourceId: source.id,
    actionPath: actionPath.trim(),
    action,
    leadId: leadId?.trim() || undefined,
  });

  if (result.ok) {
    return {
      ok: true,
      resultSummary: result.finalUrl
        ? "Action completed"
        : undefined,
    };
  }
  return {
    ok: false,
    error: result.error ?? "Action failed",
  };
}
