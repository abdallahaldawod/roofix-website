/**
 * Server-only: Web Push notifications for control centre (new lead, lead accepted).
 * Uses VAPID keys from env. Do not import in client code.
 */

import webPush from "web-push";
import { getAdminFirestore } from "@/lib/firebase/admin";

const COLLECTION = "push_subscriptions";

function getVapidKeys(): { publicKey: string; privateKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/** Call once at startup or before first send. Sets VAPID details on web-push. */
function ensureVapidSet(): boolean {
  const keys = getVapidKeys();
  if (!keys) return false;
  webPush.setVapidDetails(
    "mailto:support@roofix.com.au",
    keys.publicKey,
    keys.privateKey
  );
  return true;
}

export type PushPayload =
  | { type: "new_lead"; title: string; activityId: string; sourceName?: string }
  | { type: "lead_accepted"; title: string; activityId: string };

function buildNotificationPayload(payload: PushPayload): string {
  const data = {
    ...payload,
    url: "/control-centre/leads",
    tag: payload.type === "new_lead" ? "new-lead" : "lead-accepted",
  };
  return JSON.stringify(data);
}

export function getVapidPublicKey(): string | null {
  const keys = getVapidKeys();
  return keys?.publicKey ?? null;
}

type SubscriptionDoc = {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: unknown;
};

/** Fetch all push subscriptions from Firestore (all admins). */
async function getSubscriptions(): Promise<webPush.PushSubscription[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const snap = await db.collection(COLLECTION).get();
  const subs: webPush.PushSubscription[] = [];
  snap.docs.forEach((doc) => {
    const d = doc.data() as SubscriptionDoc;
    if (d.endpoint && d.keys?.p256dh && d.keys?.auth) {
      subs.push({
        endpoint: d.endpoint,
        keys: { p256dh: d.keys.p256dh, auth: d.keys.auth },
      });
    }
  });
  return subs;
}

/** Send a push notification to all subscribed admin clients. */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  if (!ensureVapidSet()) return;
  const subscriptions = await getSubscriptions();
  const body = buildNotificationPayload(payload);
  const options = {
    TTL: 60 * 60 * 24, // 24h
  };
  await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(sub, body, options).catch((err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or invalid; caller can remove from DB if we had ref
        }
        throw err;
      })
    )
  );
}

/** Save a push subscription for the given admin user. */
export async function saveSubscription(
  userId: string,
  subscription: webPush.PushSubscription
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore not configured");
  const endpoint = subscription.endpoint;
  const id = Buffer.from(endpoint).toString("base64url").slice(0, 100);
  await db.collection(COLLECTION).doc(id).set({
    userId,
    endpoint,
    keys: subscription.keys,
    createdAt: new Date(),
  });
}
