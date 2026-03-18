import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";

const ACTIVITY_COLLECTION = "lead_activity";
const RAW_COLLECTION = "scanned_leads";

/**
 * DELETE: remove a lead_activity document AND clear the matching scanned_leads
 * raw record(s) so the lead can be re-imported on the next scan.
 *
 * Body: { id: string } or { ids: string[] } for bulk.
 */
export async function DELETE(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept a single id or a batch of ids.
  const ids: string[] = [];
  if (body && typeof body === "object") {
    if ("id" in body && typeof (body as { id: unknown }).id === "string") {
      ids.push((body as { id: string }).id.trim());
    } else if ("ids" in body && Array.isArray((body as { ids: unknown }).ids)) {
      for (const item of (body as { ids: unknown[] }).ids) {
        if (typeof item === "string" && item.trim()) ids.push(item.trim());
      }
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "id or ids is required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  try {
    // Process in chunks of 500 (Firestore batch limit).
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const id of chunk) {
        // 1. Delete from lead_activity.
        batch.delete(db.collection(ACTIVITY_COLLECTION).doc(id));
      }

      // 2. Find and delete matching scanned_leads raw records (by activityId).
      //    Firestore doesn't support OR queries across chunks in one call, so query per id.
      for (const id of chunk) {
        const rawSnap = await db
          .collection(RAW_COLLECTION)
          .where("activityId", "==", id)
          .get();
        for (const rawDoc of rawSnap.docs) {
          batch.delete(rawDoc.ref);
        }
      }

      await batch.commit();
    }

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
