import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { invalidateContentCache } from "@/lib/data";
import { getDefaultPageContent, type PageContentMap, type PageId } from "@/lib/page-content";
import { NextResponse } from "next/server";

const PAGES_COLLECTION = "pages";
const VALID_PAGE_IDS: PageId[] = ["home", "about", "contact"];

function isValidPageId(id: string): id is PageId {
  return VALID_PAGE_IDS.includes(id as PageId);
}

/** GET: return current page content (from Firestore or defaults). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ pageId: string }> }
) {
  const authResult = await requireControlCentreAuth(_request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  const { pageId } = await context.params;
  if (!isValidPageId(pageId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid page ID. Use home, about, or contact." },
      { status: 400 }
    );
  }

  try {
    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not configured" },
        { status: 503 }
      );
    }
    const snap = await db.collection(PAGES_COLLECTION).doc(pageId).get();
    const data = snap.data();
    const content =
      data && typeof data === "object"
        ? (data as PageContentMap[PageId])
        : getDefaultPageContent(pageId as PageId);
    return NextResponse.json({ ok: true, content });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load page" },
      { status: 500 }
    );
  }
}

/** PUT: save page content to Firestore. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ pageId: string }> }
) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  const { pageId } = await context.params;
  if (!isValidPageId(pageId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid page ID. Use home, about, or contact." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  try {
    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not configured" },
        { status: 503 }
      );
    }
    const content = body as PageContentMap[PageId];
    await db.collection(PAGES_COLLECTION).doc(pageId).set(content, { merge: true });
    invalidateContentCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save page" },
      { status: 500 }
    );
  }
}
