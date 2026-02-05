/**
 * Firebase client SDK – browser only.
 * Used in /control-centre for auth, Firestore writes, and Storage uploads.
 * Requires NEXT_PUBLIC_FIREBASE_* env vars.
 */

import { getApps, initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local (see .env.local.example)."
    );
  }
  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getFirebaseApp() {
  if (typeof window === "undefined") {
    throw new Error("Firebase client must be used in the browser only.");
  }
  const apps = getApps();
  if (apps.length > 0) return apps[0]!;
  return initializeApp(getFirebaseConfig());
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
    try {
      connectAuthEmulator(
        auth,
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
        { disableWarnings: true }
      );
    } catch {
      // ignore if already connected
    }
  }
  return auth;
}

export function getFirestoreDb() {
  const app = getFirebaseApp();
  const db = getFirestore(app);
  if (process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST) {
    try {
      const [host, port] = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST.split(":");
      connectFirestoreEmulator(db, host ?? "localhost", parseInt(port ?? "8080", 10));
    } catch {
      // ignore
    }
  }
  return db;
}

export function getFirebaseStorage() {
  const app = getFirebaseApp();
  const storage = getStorage(app);
  if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST) {
    try {
      connectStorageEmulator(
        storage,
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST.replace("http://", "").split(":")[0] ?? "localhost",
        parseInt(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST.split(":")[1] ?? "9199", 10)
      );
    } catch {
      // ignore
    }
  }
  return storage;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}
