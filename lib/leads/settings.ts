import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { LeadSettings, LeadSettingsUpdate } from "./types";

const SETTINGS_DOC_PATH = "lead_settings/global";

export const DEFAULT_SETTINGS: LeadSettings = {
  automationEnabled: false,
  defaultMode: "dry-run",
  scanInterval: 15,
  maxAcceptsPerDay: 50,
  maxAcceptsPerHour: 10,
  maxScansPerHour: 200,
  cooldownMinutes: 30,
  stopOnError: true,
  minScore: 20,
  rejectScore: 10,
  requireKeywordMatch: true,
  ignoreDuplicates: true,
  notifyAccepted: true,
  notifyFailedScans: true,
  notifyErrors: true,
  notifyEmail: "",
};

/** Map Firestore document data to LeadSettings (same defaults as getSettings). */
function docDataToLeadSettings(d: DocumentData): LeadSettings {
  return {
    automationEnabled: d.automationEnabled ?? DEFAULT_SETTINGS.automationEnabled,
    defaultMode: d.defaultMode ?? DEFAULT_SETTINGS.defaultMode,
    scanInterval: d.scanInterval ?? DEFAULT_SETTINGS.scanInterval,
    maxAcceptsPerDay: d.maxAcceptsPerDay ?? DEFAULT_SETTINGS.maxAcceptsPerDay,
    maxAcceptsPerHour: d.maxAcceptsPerHour ?? DEFAULT_SETTINGS.maxAcceptsPerHour,
    maxScansPerHour: d.maxScansPerHour ?? DEFAULT_SETTINGS.maxScansPerHour,
    cooldownMinutes: d.cooldownMinutes ?? DEFAULT_SETTINGS.cooldownMinutes,
    stopOnError: d.stopOnError ?? DEFAULT_SETTINGS.stopOnError,
    minScore: d.minScore ?? DEFAULT_SETTINGS.minScore,
    rejectScore: d.rejectScore ?? DEFAULT_SETTINGS.rejectScore,
    requireKeywordMatch: d.requireKeywordMatch ?? DEFAULT_SETTINGS.requireKeywordMatch,
    ignoreDuplicates: d.ignoreDuplicates ?? DEFAULT_SETTINGS.ignoreDuplicates,
    notifyAccepted: d.notifyAccepted ?? DEFAULT_SETTINGS.notifyAccepted,
    notifyFailedScans: d.notifyFailedScans ?? DEFAULT_SETTINGS.notifyFailedScans,
    notifyErrors: d.notifyErrors ?? DEFAULT_SETTINGS.notifyErrors,
    notifyEmail: d.notifyEmail ?? DEFAULT_SETTINGS.notifyEmail,
  };
}

export async function getSettings(): Promise<LeadSettings | null> {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, SETTINGS_DOC_PATH));
  if (!snap.exists()) return null;
  return docDataToLeadSettings(snap.data());
}

/**
 * Real-time listener for `lead_settings/global`. Keeps UI in sync across tabs/pages.
 * When the doc is missing, emits DEFAULT_SETTINGS.
 */
export function subscribeToSettings(
  onData: (settings: LeadSettings) => void,
  onError?: (error: Error) => void
): () => void {
  const db = getFirestoreDb();
  return onSnapshot(
    doc(db, SETTINGS_DOC_PATH),
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SETTINGS);
        return;
      }
      onData(docDataToLeadSettings(snap.data()));
    },
    (err) => {
      onError?.(err);
      onData(DEFAULT_SETTINGS);
    }
  );
}

export async function saveSettings(data: LeadSettingsUpdate): Promise<void> {
  const db = getFirestoreDb();
  await setDoc(
    doc(db, SETTINGS_DOC_PATH),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
