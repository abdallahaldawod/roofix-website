/**
 * Firebase Admin SDK – server-side only.
 * Used for public page reads from Firestore (projects, services, testimonials).
 * Requires FIREBASE_PROJECT_ID and either:
 * - FIREBASE_SERVICE_ACCOUNT_KEY (full JSON string), or
 * - FIREBASE_SERVICE_ACCOUNT_KEY_PATH (path to JSON file; dev only, avoids paste corruption).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { getApps, initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Firebase Console JSON uses snake_case; cert() requires camelCase. */
function toServiceAccount(raw: Record<string, unknown>): ServiceAccount {
  const privateKey = (raw.privateKey ?? raw.private_key) as string | undefined;
  const clientEmail = (raw.clientEmail ?? raw.client_email) as string | undefined;
  const projectId = (raw.projectId ?? raw.project_id) as string | undefined;
  if (!privateKey || !clientEmail) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY must include private_key and client_email (or privateKey and clientEmail)."
    );
  }
  // Ensure PEM newlines are real newlines (env vars sometimes double-escape)
  const normalizedPrivateKey = privateKey.replace(/\\n/g, "\n");
  return {
    projectId: projectId ?? process.env.FIREBASE_PROJECT_ID ?? "",
    clientEmail,
    privateKey: normalizedPrivateKey,
  };
}

function getKeyJson(): string {
  // In development, allow loading from a file path to avoid copy-paste corruption of the private key
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (process.env.NODE_ENV === "development" && keyPath?.trim()) {
    try {
      const resolved = resolve(process.cwd(), keyPath.trim());
      return readFileSync(resolved, "utf8");
    } catch (e) {
      console.error("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY_PATH read failed:", e instanceof Error ? e.message : e);
    }
  }
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson || keyJson.trim() === "") {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_SERVICE_ACCOUNT_KEY_PATH in dev) is required. See .env.local.example."
    );
  }
  return keyJson;
}

function getFirebaseAdminConfig(): ServiceAccount | { projectId: string } {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required for Firebase Admin.");
  }

  const keyJson = getKeyJson();
  try {
    const raw = JSON.parse(keyJson) as Record<string, unknown>;
    return toServiceAccount(raw);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Firebase Admin] Service account JSON parse failed:", e);
    }
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is set but invalid. Use the full service account JSON, or in dev set FIREBASE_SERVICE_ACCOUNT_KEY_PATH to the path to the .json file."
    );
  }
}

function getAdminApp() {
  const apps = getApps();
  if (apps.length > 0) return apps[0]!;
  const config = getFirebaseAdminConfig();
  const hasCredential =
    "privateKey" in config && typeof (config as ServiceAccount).privateKey === "string";
  const credential = hasCredential
    ? { credential: cert(config as ServiceAccount) }
    : { projectId: config.projectId };
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  return initializeApp({
    ...credential,
    ...(databaseURL ? { databaseURL } : {}),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

/** Returns null if Firebase Admin is misconfigured so the data layer can return [] instead of throwing (avoids 500 in production). */
export function getAdminFirestore(): ReturnType<typeof getFirestore> | null {
  try {
    const app = getAdminApp();
    return getFirestore(app);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Firebase Admin] getAdminFirestore failed. Public pages will show empty data.", e instanceof Error ? e.message : e);
    }
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  const hasProjectId = Boolean(process.env.FIREBASE_PROJECT_ID);
  const hasKey =
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) ||
    (process.env.NODE_ENV === "development" && Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim()));
  return hasProjectId && hasKey;
}
