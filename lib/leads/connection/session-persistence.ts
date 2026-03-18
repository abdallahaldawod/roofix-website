/**
 * Server-only: session persistence and validation for external source auth.
 * One session file per source; paths and validation are source-agnostic.
 */

import { resolve, dirname } from "path";
import { mkdirSync, readFileSync, statSync } from "fs";

const AUTH_DIR = ".auth";
const SOURCES_DIR = "sources";
const STORAGE_STATE_FILENAME = "storage-state.json";

/**
 * Relative path for a source's storage state (stored in Firestore; reusable by scan runner).
 */
export function getStorageStateRelativePath(sourceId: string): string {
  return `${AUTH_DIR}/${SOURCES_DIR}/${sourceId}/${STORAGE_STATE_FILENAME}`;
}

/**
 * Absolute path for a source's storage state file.
 */
export function getStorageStateAbsolutePath(sourceId: string): string {
  return resolve(process.cwd(), getStorageStateRelativePath(sourceId));
}

/**
 * Resolve a relative storage state path (from Firestore) to an absolute path.
 */
export function resolveStorageStatePath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

/**
 * Ensure the directory for a source's session file exists.
 */
export function ensureSessionDir(sourceId: string): void {
  const absolute = getStorageStateAbsolutePath(sourceId);
  mkdirSync(dirname(absolute), { recursive: true });
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
