export type SourceStatus = "Active" | "Paused" | "Error";
export type SourceMode = "Manual" | "Dry Run" | "Live";

export type LeadSource = {
  id: string;
  name: string;
  platform: string;
  type: string;
  status: SourceStatus;
  mode: SourceMode;
  ruleSet: string;
  lastScan: string;
  scannedToday: number;
  matchedToday: number;
};

export type OverviewStat = {
  id: string;
  title: string;
  value: string | number;
  status?: "Healthy" | "Error";
};

export const mockOverviewStats: OverviewStat[] = [
  { id: "active-sources", title: "Active Sources", value: 3 },
  { id: "leads-scanned", title: "Leads Scanned Today", value: 47 },
  { id: "leads-matched", title: "Leads Matched", value: 12 },
  { id: "leads-accepted", title: "Leads Accepted", value: 8 },
  { id: "system-status", title: "System Status", value: "Healthy", status: "Healthy" },
];

export type RuleSetStatus = "Active" | "Inactive";

export type RuleSet = {
  id: string;
  name: string;
  description: string;
  sourcesUsing: number;
  minScore: number;
  status: RuleSetStatus;
  requiredKeywords: string[];
  excludedKeywords: string[];
  scoringRules: { keyword: string; score: number }[];
  locationFilters: string[];
  thresholds: { accept: number; review: number; reject: number };
  safetyControls: { maxLeadsPerDay: number; cooldownMinutes: number };
};

export const mockRuleSets: RuleSet[] = [
  {
    id: "rs-default",
    name: "Default",
    description: "General-purpose rule set applied to all sources unless overridden.",
    sourcesUsing: 2,
    minScore: 20,
    status: "Active",
    requiredKeywords: ["roof", "roofing"],
    excludedKeywords: ["diy", "advice only"],
    scoringRules: [
      { keyword: "metal roof", score: 20 },
      { keyword: "tile roof", score: 15 },
      { keyword: "gutter", score: 10 },
      { keyword: "urgent", score: 15 },
    ],
    locationFilters: ["Sydney", "2000", "2010", "2060"],
    thresholds: { accept: 40, review: 20, reject: 0 },
    safetyControls: { maxLeadsPerDay: 50, cooldownMinutes: 30 },
  },
  {
    id: "rs-roofing-metro",
    name: "Roofing Metro",
    description: "Targets high-value metropolitan roofing jobs with location scoring.",
    sourcesUsing: 1,
    minScore: 30,
    status: "Active",
    requiredKeywords: ["roof", "replace", "install"],
    excludedKeywords: ["repair only", "patch", "diy"],
    scoringRules: [
      { keyword: "full replacement", score: 30 },
      { keyword: "new build", score: 25 },
      { keyword: "metal", score: 20 },
      { keyword: "terracotta", score: 15 },
    ],
    locationFilters: ["Sydney CBD", "North Shore", "Inner West", "2000", "2065"],
    thresholds: { accept: 50, review: 30, reject: 0 },
    safetyControls: { maxLeadsPerDay: 30, cooldownMinutes: 60 },
  },
  {
    id: "rs-repairs-only",
    name: "Repairs Only",
    description: "Focused on smaller repair jobs — leaks, broken tiles, minor damage.",
    sourcesUsing: 1,
    minScore: 15,
    status: "Active",
    requiredKeywords: ["repair", "leak", "fix"],
    excludedKeywords: ["full replacement", "new install"],
    scoringRules: [
      { keyword: "leak", score: 20 },
      { keyword: "storm damage", score: 25 },
      { keyword: "broken tile", score: 15 },
    ],
    locationFilters: ["Sydney", "Parramatta", "Blacktown"],
    thresholds: { accept: 30, review: 15, reject: 0 },
    safetyControls: { maxLeadsPerDay: 40, cooldownMinutes: 20 },
  },
  {
    id: "rs-high-value",
    name: "High Value",
    description: "Targets premium, large-scale roofing projects only.",
    sourcesUsing: 0,
    minScore: 50,
    status: "Inactive",
    requiredKeywords: ["commercial", "industrial", "large"],
    excludedKeywords: ["small", "patch", "diy", "single tile"],
    scoringRules: [
      { keyword: "commercial", score: 40 },
      { keyword: "warehouse", score: 35 },
      { keyword: "factory", score: 35 },
      { keyword: "full replacement", score: 30 },
    ],
    locationFilters: ["Sydney", "Parramatta", "Liverpool", "Penrith"],
    thresholds: { accept: 70, review: 50, reject: 0 },
    safetyControls: { maxLeadsPerDay: 10, cooldownMinutes: 120 },
  },
];

// ─── Activity ────────────────────────────────────────────────────────────────

export type ActivityDecision = "Accept" | "Review" | "Reject";
export type ActivityStatus = "Scanned" | "Processed" | "Failed";

export type ActivityLead = {
  id: string;
  title: string;
  description: string;
  source: string;
  suburb: string;
  matchedKeywords: string[];
  score: number;
  scoreBreakdown: { keyword: string; score: number }[];
  decision: ActivityDecision;
  time: string;
  status: ActivityStatus;
  timeline: { time: string; event: string }[];
};

export type ActivityStat = {
  id: string;
  title: string;
  value: number | string;
};

export const mockActivityStats: ActivityStat[] = [
  { id: "leads-today", title: "Leads Today", value: 47 },
  { id: "accepted", title: "Accepted", value: 28 },
  { id: "rejected", title: "Rejected", value: 9 },
  { id: "review", title: "Review", value: 7 },
  { id: "failed", title: "Failed", value: 3 },
];

export const mockActivityLeads: ActivityLead[] = [
  {
    id: "al-1",
    title: "Full roof replacement in Strathfield",
    description:
      "Looking for a contractor to fully replace the existing terracotta tile roof on a 3-bedroom house in Strathfield. The current roof is approximately 25 years old and has sustained storm damage. Urgent job — water is leaking into the ceiling.",
    source: "hipages",
    suburb: "Strathfield",
    matchedKeywords: ["roof", "replacement", "tile roof", "urgent"],
    score: 75,
    scoreBreakdown: [
      { keyword: "tile roof", score: 15 },
      { keyword: "full replacement", score: 30 },
      { keyword: "urgent", score: 15 },
      { keyword: "roof", score: 15 },
    ],
    decision: "Accept",
    time: "2 min ago",
    status: "Processed",
    timeline: [
      { time: "9:14.00.000 am", event: "Lead scanned from hipages" },
      { time: "9:14.00.001 am", event: "Keywords matched: roof, replacement, tile roof, urgent" },
      { time: "9:14.00.002 am", event: "Score computed: 75" },
      { time: "9:14.00.003 am", event: "Decision: Accept (threshold 40)" },
      { time: "9:15.00.000 am", event: "Lead marked as Processed" },
    ],
  },
  {
    id: "al-2",
    title: "Roof leak repair in Bankstown",
    description:
      "Have a leak near the ridge cap after recent rain. Looking for a roofer to inspect and fix. Property is a double-storey brick home. Not urgent but want it done within 2 weeks.",
    source: "Oneflare",
    suburb: "Bankstown",
    matchedKeywords: ["roof", "leak", "repair"],
    score: 35,
    scoreBreakdown: [
      { keyword: "roof", score: 15 },
      { keyword: "leak", score: 20 },
    ],
    decision: "Review",
    time: "14 min ago",
    status: "Scanned",
    timeline: [
      { time: "9:02.00.000 am", event: "Lead scanned from Oneflare" },
      { time: "9:02.00.001 am", event: "Keywords matched: roof, leak, repair" },
      { time: "9:02.00.002 am", event: "Score computed: 35" },
      { time: "9:02.00.003 am", event: "Decision: Review (threshold 20, below accept 40)" },
    ],
  },
  {
    id: "al-3",
    title: "Gutter clean in Parramatta",
    description:
      "Looking for someone to clean gutters on a single-storey home. Some leaf buildup causing overflow in the back corner. Also happy for a general roof inspection while up there.",
    source: "Roofix Website",
    suburb: "Parramatta",
    matchedKeywords: ["roof", "gutter"],
    score: 50,
    scoreBreakdown: [
      { keyword: "roof", score: 15 },
      { keyword: "gutter", score: 10 },
      { keyword: "urgent", score: 0 },
    ],
    decision: "Accept",
    time: "31 min ago",
    status: "Processed",
    timeline: [
      { time: "8:45.00.000 am", event: "Lead submitted via Roofix Website form" },
      { time: "8:45.00.001 am", event: "Keywords matched: roof, gutter" },
      { time: "8:45.00.002 am", event: "Score computed: 50" },
      { time: "8:46.00.000 am", event: "Decision: Accept (threshold 40)" },
      { time: "8:46.00.001 am", event: "Lead marked as Processed" },
    ],
  },
  {
    id: "al-4",
    title: "Terracotta tile roof replacement in Chatswood",
    description:
      "Replacing old terracotta tile roof on a federation home in Chatswood. Need a specialist who has experience with heritage-style properties. Full replacement preferred over repairs.",
    source: "hipages",
    suburb: "Chatswood",
    matchedKeywords: ["roof", "terracotta", "replacement"],
    score: 65,
    scoreBreakdown: [
      { keyword: "roof", score: 15 },
      { keyword: "terracotta", score: 15 },
      { keyword: "full replacement", score: 30 },
      { keyword: "tile roof", score: 5 },
    ],
    decision: "Accept",
    time: "48 min ago",
    status: "Processed",
    timeline: [
      { time: "8:28.00.000 am", event: "Lead scanned from hipages" },
      { time: "8:28.00.001 am", event: "Keywords matched: roof, terracotta, replacement" },
      { time: "8:28.00.002 am", event: "Score computed: 65" },
      { time: "8:28.00.003 am", event: "Decision: Accept (threshold 40)" },
      { time: "8:29.00.000 am", event: "Lead marked as Processed" },
    ],
  },
  {
    id: "al-5",
    title: "DIY roof patch in Penrith",
    description:
      "I patched my roof myself last year but it's started leaking again. Looking for advice on what to do or maybe someone who can have a look for cheap. Not looking to spend a lot.",
    source: "hipages",
    suburb: "Penrith",
    matchedKeywords: ["roof"],
    score: 5,
    scoreBreakdown: [{ keyword: "roof", score: 5 }],
    decision: "Reject",
    time: "1 hr ago",
    status: "Scanned",
    timeline: [
      { time: "8:10.00.000 am", event: "Lead scanned from hipages" },
      { time: "8:10.00.001 am", event: 'Excluded keyword matched: "diy"' },
      { time: "8:10.00.002 am", event: "Score computed: 5" },
      { time: "8:10.00.003 am", event: "Decision: Reject (score below review threshold 20)" },
    ],
  },
  {
    id: "al-6",
    title: "Commercial warehouse re-roof in Wetherill Park",
    description:
      "Large commercial warehouse requiring a full roof replacement. Current roof is Colorbond but has significant rust and corrosion. Approx 2,000 sqm. Looking for an experienced commercial roofer. Job is urgent — part of the roof collapsed in a storm.",
    source: "hipages",
    suburb: "Wetherill Park",
    matchedKeywords: ["roof", "commercial", "full replacement", "urgent"],
    score: 90,
    scoreBreakdown: [
      { keyword: "commercial", score: 40 },
      { keyword: "full replacement", score: 30 },
      { keyword: "urgent", score: 15 },
      { keyword: "roof", score: 5 },
    ],
    decision: "Accept",
    time: "2 hr ago",
    status: "Processed",
    timeline: [
      { time: "7:15.00.000 am", event: "Lead scanned from hipages" },
      { time: "7:15.00.001 am", event: "Keywords matched: roof, commercial, full replacement, urgent" },
      { time: "7:15.00.002 am", event: "Score computed: 90" },
      { time: "7:15.00.003 am", event: "Decision: Accept (threshold 40)" },
      { time: "7:16.00.000 am", event: "Lead marked as Processed" },
    ],
  },
  {
    id: "al-7",
    title: "Emergency leak fix in Newtown",
    description:
      "Water coming through ceiling after last night's storm. Need someone as soon as possible.",
    source: "Oneflare",
    suburb: "Newtown",
    matchedKeywords: [],
    score: 0,
    scoreBreakdown: [],
    decision: "Review",
    time: "3 hr ago",
    status: "Failed",
    timeline: [
      { time: "6:45.00.000 am", event: "Lead scanned from Oneflare" },
      { time: "6:45.00.001 am", event: "Scan failed: connection timeout during keyword extraction" },
      { time: "6:45.00.002 am", event: "Marked as Failed — manual review required" },
    ],
  },
];

// ─── Sources ──────────────────────────────────────────────────────────────────

export const mockSources: LeadSource[] = [
  {
    id: "1",
    name: "hipages Roofing",
    platform: "hipages",
    type: "Job board",
    status: "Active",
    mode: "Live",
    ruleSet: "Default",
    lastScan: "2 min ago",
    scannedToday: 12,
    matchedToday: 3,
  },
  {
    id: "2",
    name: "Oneflare Roofing",
    platform: "Oneflare",
    type: "Job board",
    status: "Paused",
    mode: "Dry Run",
    ruleSet: "Roofing only",
    lastScan: "1 hour ago",
    scannedToday: 8,
    matchedToday: 2,
  },
  {
    id: "3",
    name: "Roofix Website",
    platform: "Website",
    type: "Form",
    status: "Active",
    mode: "Live",
    ruleSet: "Default",
    lastScan: "Just now",
    scannedToday: 5,
    matchedToday: 5,
  },
];
