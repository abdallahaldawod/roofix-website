/**
 * Verify Firebase ID token and ensure user is admin. Use in API routes for control-centre.
 */

import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

export type AuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: number; message: string };

export async function requireControlCentreAuth(
  request: Request
): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    console.warn("[control-centre auth] Unauthorized: Missing Authorization header");
    return { ok: false, status: 401, message: "Missing Authorization header" };
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminFirestore();
    if (!db) {
      console.warn("[control-centre auth] Service unavailable: Firestore not configured");
      return { ok: false, status: 503, message: "Service unavailable" };
    }
    const userSnap = await db.collection("users").doc(uid).get();
    const role = (userSnap.data() as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      console.warn("[control-centre auth] Forbidden: user role is not admin", { uid });
      return { ok: false, status: 403, message: "Admin access required" };
    }
    return { ok: true, uid };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid token";
    console.warn("[control-centre auth] Unauthorized:", message);
    return {
      ok: false,
      status: 401,
      message: "Invalid token",
    };
  }
}
