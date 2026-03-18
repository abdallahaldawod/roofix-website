/**
 * Types for external source adapters (read-only browser ingestion).
 * No UI logic; used by scan runner and adapters.
 */

import type { Page } from "playwright";

/** Context passed to adapters; runner provides a Playwright page and optional base URL / storage state path. */
export interface BrowserScanContext {
  page: Page;
  baseURL?: string;
  storageStatePath?: string;
}

/** Optional saved session for adapter (e.g. path to Playwright storageState JSON). */
export type AdapterAuthState = {
  storageStatePath?: string;
};

/** One lead as extracted by an adapter before normalization. */
export type RawExtractedLead = {
  externalId?: string;
  title: string;
  description: string;
  suburb: string;
  postcode?: string;
  raw?: Record<string, unknown>;
};

/** Read-only source adapter: open, optionally restore session, navigate to list, extract leads. No accept/submit/send. */
export interface SourceAdapter {
  readonly platformId: string;
  /**
   * CSS selector for the lead card elements on the Leads URL.
   * When present, the background scan runner uses this to wait for cards before calling extractLeads,
   * replacing the need for extractionConfig.leadCardSelector on the source document.
   */
  readonly leadCardSelector?: string;
  /**
   * Hostname (without www.) this adapter handles, e.g. "hipages.com.au".
   * Used by the registry to look up an adapter by leadsUrl when source.platform is generic.
   */
  readonly leadsUrlHostname?: string;
  open(context: BrowserScanContext): Promise<void>;
  loginIfNeeded(
    context: BrowserScanContext,
    authState?: AdapterAuthState
  ): Promise<AdapterAuthState | null>;
  navigateToList(context: BrowserScanContext): Promise<void>;
  extractLeads(context: BrowserScanContext): Promise<RawExtractedLead[]>;
}
