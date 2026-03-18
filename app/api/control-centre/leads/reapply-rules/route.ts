import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourcesAdmin } from "@/lib/leads/sources-admin";
import { getRuleSetsAdmin } from "@/lib/leads/rule-sets-admin";
import {
  getActivitiesBySourceIdAdmin,
  updateActivityRuleResultAdmin,
} from "@/lib/leads/activity-admin";
import { performHipagesAction } from "@/lib/leads/hipages-action";
import { evaluateLead, type EvaluationInput } from "@/lib/leads/rule-engine";
import type { LeadRuleSet, TriggerPlatformAction } from "@/lib/leads/types";

/**
 * POST: Re-apply the current rule set to existing leads.
 * Body: { sourceId?: string } — optional; if provided, only that source's leads are updated; otherwise all sources.
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
    body = {};
  }
  const { sourceId } = (body || {}) as Record<string, unknown>;
  const filterSourceId =
    typeof sourceId === "string" && sourceId.trim() ? sourceId.trim() : null;

  const [sources, ruleSets] = await Promise.all([
    getSourcesAdmin(),
    getRuleSetsAdmin(),
  ]);
  const ruleSetMap = new Map<string, LeadRuleSet>(
    ruleSets.map((rs) => [rs.id, rs])
  );

  const sourcesToProcess = filterSourceId
    ? sources.filter((s) => s.id === filterSourceId)
    : sources;

  let updated = 0;
  const errors: string[] = [];

  for (const source of sourcesToProcess) {
    const ruleSetId = source.ruleSetId ?? "";
    const ruleSet = ruleSetId ? ruleSetMap.get(ruleSetId) : null;
    if (!ruleSet) {
      if (ruleSetId) errors.push(`Source "${source.name}": rule set not found`);
      continue;
    }

    const activities = await getActivitiesBySourceIdAdmin(source.id);
    for (const { id: activityId, data } of activities) {
      const title = (data.title as string) ?? "";
      const description = (data.description as string) ?? "";
      const suburb = (data.suburb as string) ?? "";
      const postcode =
        data.postcode !== undefined && data.postcode !== null
          ? (data.postcode as string)
          : undefined;

      const input: EvaluationInput = {
        title,
        description,
        suburb,
        postcode,
      };
      const result = evaluateLead(input, ruleSet);

      try {
        await updateActivityRuleResultAdmin(activityId, {
          matchedKeywords: result.matchedKeywords,
          excludedMatched: result.excludedMatched,
          score: result.score,
          scoreBreakdown: result.scoreBreakdown,
          decision: result.decision,
          reasons: result.reasons,
          timeline: result.timeline,
          status: result.status,
          ruleSetId: ruleSet.id,
        });
        updated++;

        // When rule set has a trigger platform action for this decision, press the button on the platform (e.g. hipages).
        const decisionKey = result.decision.toLowerCase() as "accept" | "review" | "reject";
        const triggerAction = ruleSet.triggerPlatformActions?.[decisionKey] as TriggerPlatformAction | undefined;
        const hipagesActions = data.hipagesActions as { accept?: string; decline?: string; waitlist?: string } | undefined;
        const actionPath = triggerAction && hipagesActions?.[triggerAction];
        if (triggerAction && typeof actionPath === "string" && actionPath.trim().startsWith("/leads/")) {
          try {
            const actionResult = await performHipagesAction({
              sourceId: source.id,
              actionPath: actionPath.trim(),
              action: triggerAction,
              leadId: activityId,
            });
            if (!actionResult.ok) {
              errors.push(
                `Activity ${activityId} (${triggerAction}): ${actionResult.error}${actionResult.step ? ` [${actionResult.step}]` : ""}`
              );
            }
          } catch (actionErr) {
            errors.push(
              `Activity ${activityId} (${triggerAction}): ${actionErr instanceof Error ? actionErr.message : String(actionErr)}`
            );
          }
        }
      } catch (e) {
        errors.push(
          `Activity ${activityId}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
