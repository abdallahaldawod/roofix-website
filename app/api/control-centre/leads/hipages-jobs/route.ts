import { NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  DEFAULT_HIPAGES_JOBS_QUERY_LIMIT,
  HIPAGES_JOBS_COLLECTION,
  mapFirestoreDocToHipagesJob,
} from "@/lib/leads/hipages-jobs-mapper";

/**
 * GET: List hipages_jobs (newest scanned first) for admins.
 * Used when browser Firestore rules still deny client reads on this collection.
 */
export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Server Firestore not configured (Admin SDK)" },
      { status: 503 }
    );
  }

  try {
    const snap = await db
      .collection(HIPAGES_JOBS_COLLECTION)
      .orderBy("scannedAt", "desc")
      .limit(DEFAULT_HIPAGES_JOBS_QUERY_LIMIT)
      .get();

    const jobs = snap.docs.map((d) => mapFirestoreDocToHipagesJob(d.id, d.data() as DocumentData));
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Query failed";
    console.warn("[hipages-jobs GET]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
