import type { FsTimestamp } from "./types";

export type HipagesJobAttachment = { url: string; label?: string };

/** Document shape for collection `hipages_jobs` (synced Hipages business jobs). */
export type HipagesJob = {
  id: string;
  jobId: string;
  customerName?: string;
  title?: string;
  description?: string;
  fullDescription?: string;
  suburb?: string;
  postcode?: string;
  jobStatus?: string;
  serviceType?: string;
  leadCost?: string;
  leadCostCredits?: number;
  postedAt?: FsTimestamp;
  postedAtIso?: string;
  postedAtText?: string;
  email?: string;
  phone?: string;
  href?: string;
  canCreateQuote?: boolean;
  attachments?: HipagesJobAttachment[];
  updatedAt?: FsTimestamp;
  syncedAt?: FsTimestamp;
  createdAt?: FsTimestamp;
};
