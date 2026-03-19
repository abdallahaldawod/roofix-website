/**
 * Hipages jobs mirror (collection: hipages_jobs). Document id = jobId.
 */

import type { FsTimestamp } from "./types";

export type HipagesJobAttachment = { url: string; label?: string };

export type HipagesJob = {
  /** Same as jobId; used as React key / doc id */
  id: string;
  jobId: string;
  href: string;
  /** Lead source that performed the sync (session / account). */
  sourceId: string;
  /** Platform name; always "Hipages" from sync pipeline. */
  sourceName: string;
  customerName?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  title?: string | null;
  /** Short preview from jobs list */
  description?: string | null;
  /** Full text from customer enquiry / detail when available */
  fullDescription?: string | null;
  serviceType?: string | null;
  attachments?: HipagesJobAttachment[];
  leadCost?: string | null;
  leadCostCredits?: number | null;
  postedAt?: FsTimestamp | null;
  postedAtIso?: string | null;
  postedAtText?: string | null;
  email?: string | null;
  phone?: string | null;
  scannedAt?: FsTimestamp;
  syncedAt?: FsTimestamp;
  source: "hipages";
  /** Status label from jobs list row (e.g. quoted, in progress) */
  jobStatus?: string | null;
  /** From jobs list: Create Quote action visible */
  canCreateQuote?: boolean;
};
