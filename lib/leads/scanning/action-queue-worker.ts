/**
 * Server-only: one cycle of processing the lead action queue.
 * For use by the local PM2 scanner worker. Claims one pending action, executes it locally
 * via Playwright, and updates queue status. Does not run from production hosting.
 */

import { claimNextPendingAction, markActionSuccess, markActionFailed } from "@/lib/leads/action-queue-admin";
import { executeQueuedAction } from "@/lib/leads/action-queue-executor";
import { getActivityByIdAdmin } from "@/lib/leads/activity-admin";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { logActionQueue } from "./action-queue-logger";

/**
 * Process at most one queued action per call: claim it, execute locally, update status.
 * Skips execution if the source's execution mode is not local_execute.
 */
export async function runActionQueueCycle(): Promise<boolean> {
  const claimed = await claimNextPendingAction();
  if (!claimed) return false;

  const source = await getSourceByIdAdmin(claimed.sourceId);
  const executionMode = source?.executionMode ?? "local_execute";
  if (executionMode !== "local_execute") {
    const errMsg =
      executionMode === "scan_only"
        ? "Execution disabled (source is in Scan only mode)."
        : "Execution disabled (source is in Queue only mode). Change to Local execute to run actions.";
    await markActionFailed(claimed.id, errMsg);
    logActionQueue("action_processing_failed", {
      actionId: claimed.id,
      sourceId: claimed.sourceId,
      leadId: claimed.leadId,
      actionType: claimed.action,
      error: errMsg,
    });
    return true;
  }

  logActionQueue("action_queue_found", {
    actionId: claimed.id,
    sourceId: claimed.sourceId,
    leadId: claimed.leadId,
    actionType: claimed.action,
  });
  logActionQueue("action_processing_started", {
    actionId: claimed.id,
    sourceId: claimed.sourceId,
    leadId: claimed.leadId,
    actionType: claimed.action,
  });

  try {
    const result = await executeQueuedAction(claimed);
    if (result.ok) {
      await markActionSuccess(claimed.id, result.resultSummary);
      logActionQueue("action_processing_success", {
        actionId: claimed.id,
        sourceId: claimed.sourceId,
        leadId: claimed.leadId,
        actionType: claimed.action,
        resultSummary: result.resultSummary,
      });
      if (claimed.action === "accept" && claimed.leadId?.trim()) {
        const { sendPushToAdmins } = await import("@/lib/push-notifications");
        const activity = await getActivityByIdAdmin(claimed.leadId.trim());
        const title = (activity?.title as string) || "Lead accepted";
        sendPushToAdmins({
          type: "lead_accepted",
          title,
          activityId: claimed.leadId.trim(),
        }).catch(() => {});
      }
      return true;
    } else {
      await markActionFailed(claimed.id, result.error);
      logActionQueue("action_processing_failed", {
        actionId: claimed.id,
        sourceId: claimed.sourceId,
        leadId: claimed.leadId,
        actionType: claimed.action,
        error: result.error,
      });
      return true;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await markActionFailed(claimed.id, errorMsg).catch(() => {});
    logActionQueue("action_processing_failed", {
      actionId: claimed.id,
      sourceId: claimed.sourceId,
      leadId: claimed.leadId,
      actionType: claimed.action,
      error: errorMsg,
    });
    return true;
  }
}
