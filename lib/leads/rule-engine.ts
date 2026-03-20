/**
 * Pure rule evaluation engine — no Firestore, no React.
 * Given a lead and a rule set, produces a score, decision, reasons, and timeline.
 */

import type { LeadRuleSet, LeadDecision, ScoringRule } from "./types";
import { formatTimelineTime } from "./format-timeline-time";

export type EvaluationInput = {
  title: string;
  description: string;
  suburb: string;
  postcode?: string;
};

export type EvaluationResult = {
  matchedKeywords: string[];
  excludedMatched: string[];
  score: number;
  scoreBreakdown: ScoringRule[];
  decision: LeadDecision;
  status: "Processed" | "Failed";
  /** Human-readable list of reasons that drove the decision. */
  reasons: string[];
  /** Timestamped audit trail for the detail modal timeline. */
  timeline: { time: string; event: string }[];
};

/** Normalise text for matching: lowercase + trim. */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Return true if the location (suburb or postcode) is allowed by the filter list. */
function locationAllowed(suburb: string, postcode: string | undefined, filters: string[]): boolean {
  if (filters.length === 0) return true;
  const suburbN = norm(suburb);
  const postcodeN = postcode ? norm(postcode) : "";
  return filters.some((f) => {
    const fN = norm(f);
    return fN === suburbN || (postcodeN && fN === postcodeN);
  });
}

export function evaluateLead(
  input: EvaluationInput,
  ruleSet: LeadRuleSet
): EvaluationResult {
  const combined = norm(
    `${input.title} ${input.description} ${input.suburb} ${input.postcode ?? ""}`
  );
  const timeline: { time: string; event: string }[] = [];
  const reasons: string[] = [];
  const scanStartMs = Date.now();
  let timelineTick = 0;
  const tMark = () => formatTimelineTime(new Date(scanStartMs + timelineTick++));

  timeline.push({ time: tMark(), event: "Lead scanned from source" });

  // ── 1. Excluded keywords ──────────────────────────────────────────────────
  const excludedMatched = ruleSet.excludedKeywords.filter((kw) =>
    combined.includes(norm(kw))
  );

  if (excludedMatched.length > 0) {
    const reason = `Excluded keyword matched: ${excludedMatched.map((k) => `"${k}"`).join(", ")}`;
    reasons.push(reason);
    timeline.push({ time: tMark(), event: reason });
    timeline.push({ time: tMark(), event: "Decision: Reject (excluded keyword)" });
    return {
      matchedKeywords: [],
      excludedMatched,
      score: 0,
      scoreBreakdown: [],
      decision: "Reject",
      status: "Processed",
      reasons,
      timeline,
    };
  }

  // ── 2. Location filter ────────────────────────────────────────────────────
  if (
    ruleSet.locationFilters.length > 0 &&
    !locationAllowed(input.suburb, input.postcode, ruleSet.locationFilters)
  ) {
    const location = [input.suburb, input.postcode].filter(Boolean).join(" ");
    const reason = `Location not in allowed list: ${location}`;
    reasons.push(reason);
    timeline.push({ time: tMark(), event: reason });
    timeline.push({ time: tMark(), event: "Decision: Reject (location not allowed)" });
    return {
      matchedKeywords: [],
      excludedMatched: [],
      score: 0,
      scoreBreakdown: [],
      decision: "Reject",
      status: "Processed",
      reasons,
      timeline,
    };
  }

  // ── 3. Required keywords ──────────────────────────────────────────────────
  const requiredMissing = ruleSet.requiredKeywords.filter(
    (kw) => !combined.includes(norm(kw))
  );
  if (
    ruleSet.requiredKeywords.length > 0 &&
    requiredMissing.length === ruleSet.requiredKeywords.length
  ) {
    const reason = "No required keywords matched";
    reasons.push(reason);
    timeline.push({ time: tMark(), event: reason });
    timeline.push({ time: tMark(), event: "Decision: Reject (no required keywords)" });
    return {
      matchedKeywords: [],
      excludedMatched: [],
      score: 0,
      scoreBreakdown: [],
      decision: "Reject",
      status: "Processed",
      reasons,
      timeline,
    };
  }

  // ── 4. Scoring ────────────────────────────────────────────────────────────
  const scoreBreakdown: ScoringRule[] = [];
  let score = 0;
  for (const rule of ruleSet.scoringRules) {
    if (combined.includes(norm(rule.keyword))) {
      scoreBreakdown.push(rule);
      score += rule.score;
    }
  }

  // Collect matched keywords (required + scoring)
  const allKeywords = [
    ...ruleSet.requiredKeywords,
    ...ruleSet.scoringRules.map((r) => r.keyword),
  ];
  const matchedKeywords = Array.from(
    new Set(allKeywords.filter((kw) => combined.includes(norm(kw))))
  );

  if (matchedKeywords.length > 0) {
    const kwEvent = `Keywords matched: ${matchedKeywords.join(", ")}`;
    timeline.push({ time: tMark(), event: kwEvent });
    reasons.push(kwEvent);
  }

  const scoreEvent = `Score computed: ${score}`;
  timeline.push({ time: tMark(), event: scoreEvent });

  // ── 5. Decision ───────────────────────────────────────────────────────────
  let decision: LeadDecision;
  if (score >= ruleSet.thresholds.accept) {
    decision = "Accept";
    reasons.push(
      `Score ${score} ≥ accept threshold ${ruleSet.thresholds.accept}`
    );
  } else if (score >= ruleSet.thresholds.review) {
    decision = "Review";
    reasons.push(
      `Score ${score} ≥ review threshold ${ruleSet.thresholds.review} but < accept threshold ${ruleSet.thresholds.accept}`
    );
  } else {
    decision = "Reject";
    reasons.push(
      `Score ${score} below review threshold ${ruleSet.thresholds.review}`
    );
  }

  timeline.push({
    time: tMark(),
    event: `Decision: ${decision} (accept≥${ruleSet.thresholds.accept}, review≥${ruleSet.thresholds.review})`,
  });
  timeline.push({ time: tMark(), event: "Lead marked as Processed" });

  return {
    matchedKeywords,
    excludedMatched: [],
    score,
    scoreBreakdown,
    decision,
    status: "Processed",
    reasons,
    timeline,
  };
}
