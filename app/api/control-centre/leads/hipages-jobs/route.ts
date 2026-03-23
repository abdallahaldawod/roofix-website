import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { docToHipagesJob } from "@/lib/leads/hipages-jobs-mapper";

const COLLECTION = "hipages_jobs";
const LIMIT = 500;

/**
 * GET: list mirrored Hipages jobs from Firestore (Admin SDK) for control centre when
 * browser rules block direct reads.
 */
export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 });
  }

  try {
    const snap = await db.collection(COLLECTION).limit(LIMIT).get();
    const jobs = snap.docs.map((d) => docToHipagesJob(d.id, d.data()));
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load jobs";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
