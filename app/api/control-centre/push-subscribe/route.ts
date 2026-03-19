import { NextResponse } from "next/server";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { saveSubscription, getVapidPublicKey } from "@/lib/push-notifications";

/** POST: save the client's push subscription. Body: PushSubscription JSON. Auth required. */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.message },
      { status: authResult.status }
    );
  }
  if (!getVapidPublicKey()) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const sub = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (
    !sub ||
    typeof sub.endpoint !== "string" ||
    !sub.keys ||
    typeof sub.keys.p256dh !== "string" ||
    typeof sub.keys.auth !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid subscription: endpoint and keys.p256dh, keys.auth required" },
      { status: 400 }
    );
  }
  try {
    await saveSubscription(authResult.uid, {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[push-subscribe]", e);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
}
