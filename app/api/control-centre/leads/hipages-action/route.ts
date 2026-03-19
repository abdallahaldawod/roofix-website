import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";

/**
 * POST: perform an accept / decline / waitlist action on a hipages lead
 * using the saved playwright session for the connected source.
 *
 * Body: { sourceId: string; actionPath: string; action: "accept" | "decline" | "waitlist"; leadId?: string }
 * actionPath is the relative path stored in lead.hipagesActions (e.g. "/leads/{id}/accept")
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { sourceId, actionPath, action, leadId } = body as Record<string, unknown>;

  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }
  if (typeof actionPath !== "string" || !actionPath.startsWith("/leads/")) {
    return NextResponse.json({ ok: false, error: "actionPath must be a /leads/... path" }, { status: 400 });
  }
  if (!["accept", "decline", "waitlist"].includes(action as string)) {
    return NextResponse.json({ ok: false, error: "action must be accept, decline, or waitlist" }, { status: 400 });
  }

  const { performHipagesAction } = await import("@/lib/leads/hipages-action");
  const result = await performHipagesAction({
    sourceId: sourceId.trim(),
    actionPath,
    action: action as "accept" | "decline" | "waitlist",
    leadId: typeof leadId === "string" && leadId.trim() ? leadId.trim() : undefined,
  });

  if (result.ok) {
    if (action === "accept" && typeof leadId === "string" && leadId.trim()) {
      const { getActivityByIdAdmin } = await import("@/lib/leads/activity-admin");
      const { sendPushToAdmins } = await import("@/lib/push-notifications");
      const activity = await getActivityByIdAdmin(leadId.trim());
      const title = (activity?.title as string) || "Lead accepted";
      sendPushToAdmins({
        type: "lead_accepted",
        title,
        activityId: leadId.trim(),
      }).catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      finalUrl: result.finalUrl,
    });
  }
  return NextResponse.json(
    { ok: false, error: result.error, step: result.step },
    { status: 500 }
  );
}
