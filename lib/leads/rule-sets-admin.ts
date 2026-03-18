/**
 * Server-only: read lead rule sets via Admin SDK.
 * Do not import in client code.
 */

import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LeadRuleSet } from "./types";
import { toFsTimestamp } from "./admin-utils";

const COLLECTION = "lead_rule_sets";

type DocData = Record<string, unknown>;

function toLeadRuleSet(id: string, d: DocData): LeadRuleSet {
  return {
    id,
    name: (d.name as string) ?? "",
    description: (d.description as string) ?? "",
    status: (d.status as LeadRuleSet["status"]) ?? "Inactive",
    minScore: (d.minScore as number) ?? 0,
    requiredKeywords: (d.requiredKeywords as string[]) ?? [],
    excludedKeywords: (d.excludedKeywords as string[]) ?? [],
    scoringRules: (d.scoringRules as LeadRuleSet["scoringRules"]) ?? [],
    locationFilters: (d.locationFilters as string[]) ?? [],
    thresholds: (d.thresholds as LeadRuleSet["thresholds"]) ?? {
      accept: 30,
      review: 15,
      reject: 0,
    },
    safetyControls: (d.safetyControls as LeadRuleSet["safetyControls"]) ?? {
      maxLeadsPerDay: 50,
      cooldownMinutes: 30,
    },
    createdAt: toFsTimestamp(d.createdAt)!,
    updatedAt: toFsTimestamp(d.updatedAt)!,
  };
}

export async function getRuleSetsAdmin(): Promise<LeadRuleSet[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => toLeadRuleSet(d.id, d.data() as DocData));
}
