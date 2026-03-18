/**
 * Mock test scan — generates 5 realistic roofing leads, evaluates them against
 * a rule set, writes results to Firestore lead_activity, and returns the records.
 */

import { evaluateLead, type EvaluationInput } from "./rule-engine";
import { writeActivityRecord } from "./activity";
import type { LeadSource, LeadRuleSet, LeadActivity } from "./types";

const MOCK_LEADS: EvaluationInput[] = [
  {
    title: "Full roof replacement needed urgently",
    description:
      "My roof is over 25 years old and has multiple damaged tiles and leaks in heavy rain. Looking for a licensed roofer to replace the full roof. Budget flexible for quality work.",
    suburb: "Strathfield",
    postcode: "2135",
  },
  {
    title: "Roof leak repair in bathroom ceiling",
    description:
      "Water is coming through the ceiling in the bathroom after rain. Looks like a flashing issue near the chimney. Need someone to inspect and repair as soon as possible.",
    suburb: "Bankstown",
    postcode: "2200",
  },
  {
    title: "Gutter clean and inspection",
    description:
      "Gutters haven't been cleaned in 2 years and are overflowing. Would like them cleaned and checked for any damage. Not an emergency but would like it done within a month.",
    suburb: "Parramatta",
    postcode: "2150",
  },
  {
    title: "Commercial flat roof reseal",
    description:
      "We have a commercial warehouse with a flat roof that needs resealing. There are signs of ponding water and minor leaks at the seams. Need a quote for full membrane replacement.",
    suburb: "Wetherill Park",
    postcode: "2164",
  },
  {
    title: "DIY advice on replacing roof tiles",
    description:
      "Just looking for some DIY advice on how to replace a couple of cracked roof tiles myself. No professional work required, just need guidance.",
    suburb: "Blacktown",
    postcode: "2148",
  },
];

export async function runMockTestScan(
  source: LeadSource,
  ruleSet: LeadRuleSet
): Promise<LeadActivity[]> {
  const results: LeadActivity[] = [];

  for (const lead of MOCK_LEADS) {
    const evalResult = evaluateLead(lead, ruleSet);

    const record = {
      title: lead.title,
      description: lead.description,
      sourceId: source.id,
      sourceName: source.name,
      suburb: lead.suburb,
      postcode: lead.postcode ?? "",
      ruleSetId: ruleSet.id,
      matchedKeywords: evalResult.matchedKeywords,
      excludedMatched: evalResult.excludedMatched,
      score: evalResult.score,
      scoreBreakdown: evalResult.scoreBreakdown,
      decision: evalResult.decision,
      status: evalResult.status,
      reasons: evalResult.reasons,
      timeline: evalResult.timeline,
      // scannedAt is set by writeActivityRecord via serverTimestamp()
      scannedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    const id = await writeActivityRecord(record);
    results.push({ ...record, id });
  }

  return results;
}
