/**
 * Server-only: orchestrate manual Connect Source flow for an external lead source.
 * Loads source, sets connecting, runs Playwright flow, validates saved session, updates auth metadata.
 */

import { FieldValue } from "firebase-admin/firestore";
import { getSourceByIdAdmin, updateSourceAuthAdmin } from "@/lib/leads/sources-admin";
import { runManualConnection } from "./playwright-connection";
import {
  getStorageStateAbsolutePath,
  getStorageStateRelativePath,
  ensureSessionDir,
  validateSavedSession,
} from "./session-persistence";

const CONNECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Run the manual Connect Source flow for the given external source.
 * Launches visible browser, waits for user to reach Leads URL, saves session,
 * validates the saved file, then updates source auth metadata.
 * Reconnect uses the same flow (previous session is overwritten; stale lastAuthError is cleared at start).
 */
export async function connectSource(
  sourceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found." };
  if (source.isSystem) return { ok: false, error: "System sources cannot be connected." };

  const loginUrl = source.loginUrl?.trim();
  const leadsUrl = source.leadsUrl?.trim();
  if (!loginUrl || !leadsUrl) {
    return { ok: false, error: "Source must have Login URL and Leads URL configured." };
  }

  // Set connecting and clear previous error (so reconnect shows clean state).
  const setConnecting = await updateSourceAuthAdmin(sourceId, {
    authStatus: "connecting",
    lastAuthError: null,
  });
  if (!setConnecting.ok) return setConnecting;

  ensureSessionDir(sourceId);
  const absolutePath = getStorageStateAbsolutePath(sourceId);

  const result = await runManualConnection({
    loginUrl,
    leadsUrl,
    storageStatePath: absolutePath,
    timeoutMs: CONNECTION_TIMEOUT_MS,
  });

  if (!result.ok) {
    await updateSourceAuthAdmin(sourceId, {
      authStatus: "failed",
      lastAuthError: result.error,
    });
    return { ok: false, error: result.error };
  }

  // Validate saved session before marking connected.
  const validation = validateSavedSession(absolutePath);
  if (!validation.valid) {
    await updateSourceAuthAdmin(sourceId, {
      authStatus: "failed",
      lastAuthError: validation.error,
    });
    return { ok: false, error: validation.error };
  }

  const relativePath = getStorageStateRelativePath(sourceId);
  const updateResult = await updateSourceAuthAdmin(sourceId, {
    authStatus: "connected",
    lastAuthAt: FieldValue.serverTimestamp(),
    lastAuthError: null,
    storageStatePath: relativePath,
  });
  if (!updateResult.ok) {
    return { ok: false, error: updateResult.error };
  }
  return { ok: true };
}
