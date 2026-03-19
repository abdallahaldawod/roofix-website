import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { ROOFIX_WEBSITE_PLATFORM } from "@/lib/leads/sources-admin";
import { createActionRequest } from "@/lib/leads/action-queue-admin";
import type { LeadActionQueueAction } from "@/lib/leads/action-queue-types";
import { runActionQueueCycle } from "@/lib/leads/scanning/action-queue-worker";

const ACTION_PATH_REGEX = /^\/leads\/([^/]+)\/(accept|decline|waitlist)$/;

/**
 * POST: Enqueue a lead action (accept / decline / waitlist) for the local worker.
 * Does not run Playwright. Only external sources (not Roofix Website) are allowed.
 *
 * Body: { sourceId: string; actionPath: string; action: "accept" | "decline" | "waitlist"; leadId: string; externalId?: string }
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 }
    );
  }

  const { sourceId, actionPath, action, leadId, externalId: bodyExternalId } =
    body as Record<string, unknown>;

  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json(
      { ok: false, error: "sourceId is required" },
      { status: 400 }
    );
  }
  if (typeof leadId !== "string" || !leadId.trim()) {
    return NextResponse.json(
      { ok: false, error: "leadId is required" },
      { status: 400 }
    );
  }
  if (typeof actionPath !== "string" || !actionPath.trim() || !actionPath.startsWith("/leads/")) {
    return NextResponse.json(
      { ok: false, error: "actionPath must be a /leads/... path" },
      { status: 400 }
    );
  }
  const validActions: LeadActionQueueAction[] = ["accept", "decline", "waitlist"];
  if (
    typeof action !== "string" ||
    !validActions.includes(action as LeadActionQueueAction)
  ) {
    return NextResponse.json(
      { ok: false, error: "action must be accept, decline, or waitlist" },
      { status: 400 }
    );
  }

  const source = await getSourceByIdAdmin(sourceId.trim());
  if (!source) {
    return NextResponse.json(
      { ok: false, error: "Source not found" },
      { status: 404 }
    );
  }
  if (source.platform === ROOFIX_WEBSITE_PLATFORM) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Accept/Decline from the dashboard is only for external leads. Roofix Website leads are not queued for local execution.",
      },
      { status: 400 }
    );
  }
  const executionMode = source.executionMode ?? "local_execute";
  if (executionMode === "scan_only") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Accept/Decline is disabled for this source (execution mode is Scan only). Change the source execution mode in Lead Sources to allow queueing.",
      },
      { status: 400 }
    );
  }

  const externalId =
    typeof bodyExternalId === "string" && bodyExternalId.trim()
      ? bodyExternalId.trim()
      : (() => {
          const match = actionPath.match(ACTION_PATH_REGEX);
          return match?.[1] ?? undefined;
        })();

  const queueId = await createActionRequest({
    leadId: leadId.trim(),
    sourceId: sourceId.trim(),
    action: action as LeadActionQueueAction,
    requestedBy: authResult.uid,
    ...(externalId && { externalId }),
    actionPath: actionPath.trim(),
  });

  if (queueId == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not queue the action. Please try again.",
      },
      { status: 500 }
    );
  }

  // Fast path: for Accept, kick local execution immediately instead of waiting for scanner loop cadence.
  if ((action as LeadActionQueueAction) === "accept") {
    void runActionQueueCycle().catch(() => {});
  }

  return NextResponse.json({ ok: true, queueId });
}
