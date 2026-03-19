/**
 * Types for the lead action queue (Firestore collection: lead_action_queue).
 * Kept separate from scan/extraction types.
 */

import type { FsTimestamp } from "./types";

/** Action type for queued lead actions. Extensible to "waitlist" etc. */
export type LeadActionQueueAction = "accept" | "decline" | "waitlist";

/** Status of a queued action. */
export type LeadActionQueueStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed";

/** Input for creating a new action request (enqueue). */
export type LeadActionQueueCreate = {
  leadId: string;
  sourceId: string;
  action: LeadActionQueueAction;
  requestedBy: string;
  externalId?: string;
  actionPath?: string;
};

/** Full queue document as stored in Firestore (when read back, timestamps as FsTimestamp). */
export type LeadActionQueueDocument = {
  id: string;
  leadId: string;
  sourceId: string;
  externalId?: string;
  action: LeadActionQueueAction;
  status: LeadActionQueueStatus;
  requestedAt: FsTimestamp | null;
  requestedBy: string;
  startedAt?: FsTimestamp | null;
  completedAt?: FsTimestamp | null;
  error?: string | null;
  resultSummary?: string | null;
  actionPath?: string | null;
};
