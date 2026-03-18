/**
 * Firestore document types for the Lead Management feature.
 * Pure TypeScript — no Firestore SDK imports.
 */

// ─── Shared ───────────────────────────────────────────────────────────────────

/** Serialised Firestore Timestamp as returned from Firestore SDK snapshot data. */
export type FsTimestamp = { seconds: number; nanoseconds: number };

// ─── Lead Sources (collection: lead_sources) ─────────────────────────────────

/** Platform id for the built-in Roofix Website system source. Use for UI guards (e.g. block create). */
export const ROOFIX_WEBSITE_PLATFORM = "roofix-website";

/** Scan method for the built-in system source only. */
export const INTERNAL_SCAN_METHOD = "internal";

/** Scan method for external sources (read-only browser ingestion). */
export const EXTERNAL_SCAN_METHOD = "Scrape";

export type LeadSourceStatus = "Active" | "Paused" | "Error";
export type LeadSourceMode = "Manual" | "Dry Run" | "Live";

/** Auth state for external browser-based sources (manual Connect flow). */
export type LeadSourceAuthStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "failed"
  | "needs_reconnect";

const AUTH_STATUS_VALUES: LeadSourceAuthStatus[] = [
  "not_connected",
  "connecting",
  "connected",
  "failed",
  "needs_reconnect",
];

/** Per-source CSS selector config for lead extraction on the Leads URL. External sources only. */
export type SourceExtractionConfig = {
  leadCardSelector: string;
  titleSelector?: string;
  descriptionSelector?: string;
  suburbSelector?: string;
  postcodeSelector?: string;
  externalIdSelector?: string;
  externalIdAttribute?: string;
  detailLinkSelector?: string;
  postedAtSelector?: string;
};

/** Debug info captured during last scan (page URL, title, card count, optional snippet). */
export type LastScanDebug = {
  pageUrl?: string;
  pageTitle?: string;
  leadCardCount?: number;
  /** Truncated HTML or text snippet for selector troubleshooting. */
  snippet?: string;
};

/** Normalize stored auth status to a known value; unknown values become not_connected. */
export function normalizeAuthStatus(
  value: string | undefined | null
): LeadSourceAuthStatus {
  if (value && AUTH_STATUS_VALUES.includes(value as LeadSourceAuthStatus)) {
    return value as LeadSourceAuthStatus;
  }
  return "not_connected";
}

export type LeadSource = {
  id: string;
  name: string;
  platform: string;
  type: string;
  status: LeadSourceStatus;
  mode: LeadSourceMode;
  ruleSetId: string;
  ruleSetName: string;
  scanMethod: string;
  scanFrequency: number; // minutes
  active: boolean;
  scannedToday: number;
  matchedToday: number;
  lastScanAt: FsTimestamp | null;
  createdAt: FsTimestamp;
  updatedAt: FsTimestamp;
  /** True for built-in system sources (e.g. Roofix Website). Not user-deletable. */
  isSystem?: boolean;
  /** Login page URL for external manual-login sources. Not used by system source. */
  loginUrl?: string;
  /** Leads/list page URL for external sources. Not used by system source. */
  leadsUrl?: string;
  /** Auth state for manual Connect flow. System sources do not use this. */
  authStatus?: LeadSourceAuthStatus | string;
  /** When the source was last successfully connected (saved session). */
  lastAuthAt?: FsTimestamp | null;
  /** Last connection attempt error message, if any. */
  lastAuthError?: string | null;
  /** Path to Playwright storage state (server/script use; reused by scan runner). */
  storageStatePath?: string;
  /** Result of last background scan: idle | success | failed | needs_reconnect. */
  lastScanStatus?: string;
  /** Last background scan error message, if any. */
  lastScanError?: string | null;
  /** Per-source extraction selectors for the Leads URL. External sources only. */
  extractionConfig?: SourceExtractionConfig;
  /** Count of leads extracted in last scan. */
  lastScanExtracted?: number;
  /** Count of duplicates skipped in last scan. */
  lastScanDuplicate?: number;
  /** Count of cards that failed extraction in last scan. */
  lastScanFailedExtraction?: number;
  /** Count of leads successfully imported (evaluated and written to lead_activity) in last scan. */
  lastScanImported?: number;
  /** Count of leads that failed evaluation/import in last scan. */
  lastScanFailedImport?: number;
  /** Optional debug info from last scan (page URL, title, card count, snippet). */
  lastScanDebug?: LastScanDebug;
  /** When true, capture extra extraction diagnostics (e.g. first-card snippet) for debugging. */
  extractionDebug?: boolean;
};

export type LeadSourceCreate = {
  name: string;
  platform?: string;
  type?: string;
  status?: LeadSourceStatus;
  mode?: LeadSourceMode;
  ruleSetId: string;
  ruleSetName: string;
  scanMethod?: string;
  scanFrequency: number;
  active: boolean;
  loginUrl?: string;
  leadsUrl?: string;
  authStatus?: string;
  extractionConfig?: SourceExtractionConfig;
  extractionDebug?: boolean;
};

export type LeadSourceUpdate = Partial<LeadSourceCreate>;

// ─── Lead Rule Sets (collection: lead_rule_sets) ──────────────────────────────

export type LeadRuleSetStatus = "Active" | "Inactive";

export type ScoringRule = { keyword: string; score: number };
export type ThresholdConfig = { accept: number; review: number; reject: number };
export type SafetyConfig = { maxLeadsPerDay: number; cooldownMinutes: number };

/** Platform button to press when this trigger fires (e.g. hipages Accept / Decline / Waitlist). */
export type TriggerPlatformAction = "accept" | "decline" | "waitlist";

/** Per-trigger platform action: when score hits Accept/Review/Reject threshold, optionally press this platform button. */
export type TriggerPlatformActions = {
  accept?: TriggerPlatformAction | null;
  review?: TriggerPlatformAction | null;
  reject?: TriggerPlatformAction | null;
};

export type LeadRuleSet = {
  id: string;
  name: string;
  description: string;
  status: LeadRuleSetStatus;
  minScore: number;
  requiredKeywords: string[];
  excludedKeywords: string[];
  scoringRules: ScoringRule[];
  locationFilters: string[];
  thresholds: ThresholdConfig;
  /** When each score trigger fires, optionally press this platform button (e.g. hipages). */
  triggerPlatformActions?: TriggerPlatformActions;
  safetyControls: SafetyConfig;
  createdAt: FsTimestamp;
  updatedAt: FsTimestamp;
};

export type LeadRuleSetCreate = {
  name: string;
  description: string;
  status: LeadRuleSetStatus;
  minScore: number;
  requiredKeywords: string[];
  excludedKeywords: string[];
  scoringRules: ScoringRule[];
  locationFilters: string[];
  thresholds: ThresholdConfig;
  triggerPlatformActions?: TriggerPlatformActions;
  safetyControls: SafetyConfig;
};

export type LeadRuleSetUpdate = Partial<LeadRuleSetCreate>;

// ─── Incoming Leads (collection: incoming_leads) ─────────────────────────────

export type IncomingLeadSource = "roofix-website" | "website";

export type IncomingLead = {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  suburb: string;
  postcode?: string;
  serviceType: string;
  title: string;
  description: string;
  source: IncomingLeadSource;
  sourceMetadata?: Record<string, string>;
  createdAt: FsTimestamp;
  processedAt?: FsTimestamp;
  activityId?: string;
};

/** Payload to create an incoming lead; id and createdAt are set by the server. */
export type IncomingLeadCreate = Omit<
  IncomingLead,
  "id" | "createdAt" | "processedAt" | "activityId"
>;

// ─── Lead Activity (collection: lead_activity) ────────────────────────────────

export type LeadDecision = "Accept" | "Review" | "Reject";
export type LeadActivityStatus = "Scanned" | "Processed" | "Failed";

export type LeadActivity = {
  id: string;
  title: string;
  description: string;
  sourceId: string;
  sourceName: string;
  suburb: string;
  /** Optional postcode (persisted from evaluation input). */
  postcode?: string;
  ruleSetId: string;
  matchedKeywords: string[];
  excludedMatched: string[];
  score: number;
  scoreBreakdown: ScoringRule[];
  decision: LeadDecision;
  status: LeadActivityStatus;
  /** Human-readable reasons that drove the decision (from rule engine). */
  reasons?: string[];
  timeline: { time: string; event: string }[];
  scannedAt: FsTimestamp;
  /** Optional contact info (e.g. from website form). */
  customerName?: string;
  email?: string;
  phone?: string;
  serviceType?: string;
  /** Timestamp when the lead was originally posted on the external platform (e.g. hipages postedAt). */
  postedAt?: FsTimestamp;
  /** Raw ISO string from the platform datetime attribute — parsed client-side to avoid server timezone errors. */
  postedAtIso?: string;
  /** Raw visible text of the time element from the platform (e.g. "Today, 6:17am") — used for accurate display. */
  postedAtText?: string;
  /** Cost to accept the lead on the external platform (e.g. "$12.50" or "3 credits" from hipages). */
  leadCost?: string;
  /** Action paths available on the hipages lead card (e.g. /leads/{id}/accept). */
  hipagesActions?: {
    accept?: string;
    acceptLabel?: string;
    decline?: string;
    declineLabel?: string;
    waitlist?: string;
    waitlistLabel?: string;
  };
  /** Attachment links from the platform (e.g. hipages lead photos/documents). */
  attachments?: { url: string; label?: string }[];
  /** True when this lead was accepted on the platform (e.g. via Accept button); keep in table and skip cleanup. */
  platformAccepted?: boolean;
  /** Hipages job number (e.g. "103") so we can open jobs/{jobId}/customer-enquiry to fetch/refresh lead info. */
  jobId?: string;
};

export type LeadActivityCreate = Omit<LeadActivity, "id">;

// ─── Scanned Leads (external scan; collection: scanned_leads) ─────────────────

/** In-memory normalized shape used by scan runner and rule engine. */
export type ScannedLead = {
  title: string;
  description: string;
  suburb: string;
  postcode?: string;
  externalId?: string;
  sourceId: string;
  sourceName: string;
  raw?: Record<string, unknown>;
};

/** Firestore document in scanned_leads. */
export type ScannedLeadRaw = {
  id: string;
  sourceId: string;
  sourceName: string;
  externalId?: string;
  dedupeKey: string;
  title: string;
  description: string;
  suburb: string;
  postcode?: string;
  raw?: Record<string, unknown>;
  scannedAt: FsTimestamp;
  activityId?: string;
};

/** Payload to create a scanned lead raw doc; id and scannedAt set by server. */
export type ScannedLeadRawCreate = Omit<ScannedLeadRaw, "id" | "scannedAt">;

// ─── Scan runs (collection: scan_runs) ────────────────────────────────────────

export type ScanRunStatus = "success" | "failed" | "needs_reconnect";

export type ScanRun = {
  id: string;
  sourceId: string;
  startedAt: FsTimestamp;
  finishedAt: FsTimestamp;
  status: ScanRunStatus;
  extracted?: number;
  duplicate?: number;
  imported?: number;
  failedExtraction?: number;
  failedImport?: number;
  /** Truncated error message for failed runs. */
  errorMessage?: string;
  debug?: LastScanDebug;
};

export type ScanRunCreate = Omit<ScanRun, "id">;

// ─── Lead Settings (document: lead_settings/global) ───────────────────────────

export type LeadSettingsMode = "manual" | "dry-run" | "live";

export type LeadSettings = {
  automationEnabled: boolean;
  defaultMode: LeadSettingsMode;
  scanInterval: number;
  maxAcceptsPerDay: number;
  maxAcceptsPerHour: number;
  maxScansPerHour: number;
  cooldownMinutes: number;
  stopOnError: boolean;
  minScore: number;
  rejectScore: number;
  requireKeywordMatch: boolean;
  ignoreDuplicates: boolean;
  notifyAccepted: boolean;
  notifyFailedScans: boolean;
  notifyErrors: boolean;
  notifyEmail: string;
};

export type LeadSettingsUpdate = Partial<LeadSettings>;
