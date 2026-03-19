import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getVapidPublicKey } from "@/lib/push-notifications";

/** GET: return the VAPID public key for the client to subscribe. Auth required. */
export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.message },
      { status: authResult.status }
    );
  }
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications not configured (missing VAPID keys)" },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
