/**
 * Server-only: session persistence and validation for external source auth.
 * Leads and jobs scanners use separate Playwright storage files under the same source directory.
 */

import { resolve, dirname } from "path";
import { mkdirSync, readFileSync, statSync, existsSync, copyFileSync } from "fs";

const AUTH_DIR = ".auth";
const SOURCES_DIR = "sources";

/** Legacy single file (pre split); still used as read fallback when canonical leads file is missing. */
const STORAGE_STATE_FILENAME = "storage-state.json";
const STORAGE_STATE_LEADS_FILENAME = "storage-state.leads.json";
const STORAGE_STATE_JOBS_FILENAME = "storage-state.jobs.json";

export type SourceSessionRef = {
  id: string;
  storageStatePath?: string | null;
};

function logSession(message: string, data: Record<string, string>): void {
  if (process.env.LEADS_SESSION_LOGS !== "1") return;
  const parts = Object.entries(data).map(([k, v]) => `${k}=${v.replace(/\|/g, ";")}`);
  console.log(`[session] ${message} | ${parts.join(" | ")}`);
}

/**
 * @deprecated Legacy relative path (`storage-state.json`). Prefer getLeadsStorageStateRelativePath for new connects.
 */
export function getStorageStateRelativePath(sourceId: string): string {
  return `${AUTH_DIR}/${SOURCES_DIR}/${sourceId}/${STORAGE_STATE_FILENAME}`;
}

export function getLeadsStorageStateRelativePath(sourceId: string): string {
  return `${AUTH_DIR}/${SOURCES_DIR}/${sourceId}/${STORAGE_STATE_LEADS_FILENAME}`;
}

export function getJobsStorageStateRelativePath(sourceId: string): string {
  return `${AUTH_DIR}/${SOURCES_DIR}/${sourceId}/${STORAGE_STATE_JOBS_FILENAME}`;
}

/**
 * @deprecated Legacy absolute path. Prefer getLeadsStorageStateAbsolutePath.
 */
export function getStorageStateAbsolutePath(sourceId: string): string {
  return resolve(process.cwd(), getStorageStateRelativePath(sourceId));
}

export function getLeadsStorageStateAbsolutePath(sourceId: string): string {
  return resolve(process.cwd(), getLeadsStorageStateRelativePath(sourceId));
}

export function getJobsStorageStateAbsolutePath(sourceId: string): string {
  return resolve(process.cwd(), getJobsStorageStateRelativePath(sourceId));
}

/**
 * Resolve a relative storage state path (from Firestore) to an absolute path.
 */
export function resolveStorageStatePath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

/**
 * Ensure the directory for a source's session files exists (canonical leads path defines the folder).
 */
export function ensureSessionDir(sourceId: string): void {
  const absolute = getLeadsStorageStateAbsolutePath(sourceId);
  mkdirSync(dirname(absolute), { recursive: true });
}

/**
 * Absolute path to use for consumer-leads Playwright flows (list scan, accept/decline, analyze, etc.).
 * Prefers `storage-state.leads.json`, then Firestore-stored path if that file exists (legacy).
 */
export function resolveLeadsStorageStateAbsolute(source: SourceSessionRef): string {
  const leadsAbs = getLeadsStorageStateAbsolutePath(source.id);
  if (existsSync(leadsAbs)) {
    logSession("leads_session_path_resolved", {
      sourceId: source.id,
      path: leadsAbs,
      via: "canonical",
    });
    return leadsAbs;
  }

  const rel = source.storageStatePath?.trim();
  if (rel) {
    try {
      const legacyAbs = resolveStorageStatePath(rel);
      if (existsSync(legacyAbs)) {
        logSession("leads_session_path_resolved", {
          sourceId: source.id,
          path: legacyAbs,
          via: "legacy_firestore",
        });
        return legacyAbs;
      }
    } catch {
      /* invalid path string */
    }
  }

  throw new Error("No leads session file found. Connect or reconnect this source.");
}

/**
 * Absolute path to use for business.hipages jobs Playwright flows.
 * Prefers `storage-state.jobs.json`; bootstraps by copying from canonical leads or legacy Firestore file if missing.
 */
export function resolveJobsStorageStateAbsolute(source: SourceSessionRef): string {
  const jobsAbs = getJobsStorageStateAbsolutePath(source.id);
  if (existsSync(jobsAbs)) {
    logSession("jobs_session_path_resolved", {
      sourceId: source.id,
      path: jobsAbs,
      via: "canonical",
    });
    return jobsAbs;
  }

  const leadsAbs = getLeadsStorageStateAbsolutePath(source.id);
  if (existsSync(leadsAbs)) {
    mkdirSync(dirname(jobsAbs), { recursive: true });
    copyFileSync(leadsAbs, jobsAbs);
    logSession("jobs_session_path_resolved", {
      sourceId: source.id,
      path: jobsAbs,
      via: "bootstrapped_from_leads",
    });
    return jobsAbs;
  }

  const rel = source.storageStatePath?.trim();
  if (rel) {
    try {
      const legacyAbs = resolveStorageStatePath(rel);
      if (existsSync(legacyAbs)) {
        mkdirSync(dirname(jobsAbs), { recursive: true });
        copyFileSync(legacyAbs, jobsAbs);
        logSession("jobs_session_path_resolved", {
          sourceId: source.id,
          path: jobsAbs,
          via: "bootstrapped_from_legacy",
        });
        return jobsAbs;
      }
    } catch {
      /* invalid path */
    }
  }

  throw new Error("No jobs session file found. Connect or reconnect this source.");
}

export type ValidateSessionResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Playwright storage state is JSON with top-level "cookies" and "origins" arrays.
 */
function isPlaywrightStorageState(obj: unknown): obj is { cookies: unknown[]; origins: unknown[] } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Array.isArray((obj as Record<string, unknown>).cookies) &&
    Array.isArray((obj as Record<string, unknown>).origins)
  );
}

/**
 * Validate that a saved session file exists and is usable (valid Playwright storage state).
 */
export function validateSavedSession(absolutePath: string): ValidateSessionResult {
  try {
    const st = statSync(absolutePath);
    if (!st.isFile()) {
      return { valid: false, error: "Session file is not a regular file." };
    }
    const raw = readFileSync(absolutePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlaywrightStorageState(parsed)) {
      return { valid: false, error: "Session file is not a valid Playwright storage state." };
    }
    return { valid: true };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return { valid: false, error: "Session file was not saved or was removed." };
    }
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Failed to read session file.",
    };
  }
}
