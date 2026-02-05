/**
 * Firebase Admin SDK – server-side only.
 * Used for public page reads from Firestore (projects, services, testimonials).
 * Requires FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_KEY (JSON string).
 */

import { getApps, initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
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

function getFirebaseAdminConfig(): ServiceAccount | { projectId: string } {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required for Firebase Admin.");
  }

  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson || keyJson.trim() === "") {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is required for Firestore. Add it to .env.local (full service account JSON as one line), then restart the dev server."
    );
  }
  try {
    const raw = JSON.parse(keyJson) as Record<string, unknown>;
    return toServiceAccount(raw);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY parse failed:", e);
    }
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is set but invalid. Use the full service account JSON as one line in .env.local."
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

export function getAdminFirestore() {
  const app = getAdminApp();
  return getFirestore(app);
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );
}
