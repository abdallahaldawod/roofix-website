/**
 * Fetch reviews from Google Business Profile (My Business API).
 * Requires OAuth2 credentials and a refresh token (one-time setup in Google Cloud).
 * Used by Control Centre Testimonials page to import Google reviews.
 */

import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { NextResponse } from "next/server";

type GbpReview = {
  name?: string;
  reviewId?: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
};

type ListReviewsResponse = {
  reviews?: GbpReview[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
};

const STAR_TO_NUMBER: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  STAR_RATING_UNSPECIFIED: 5,
};

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_GBP_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_GBP_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_GBP_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function GET(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.message },
      { status: authResult.status }
    );
  }

  const accountId = process.env.GOOGLE_GBP_ACCOUNT_ID?.trim();
  const locationId = process.env.GOOGLE_GBP_LOCATION_ID?.trim();
  if (!accountId || !locationId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Business Profile is not configured. Set GOOGLE_GBP_ACCOUNT_ID, GOOGLE_GBP_LOCATION_ID, and OAuth credentials (see .env.local.example).",
      },
      { status: 503 }
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not get Google access token. Check GOOGLE_GBP_CLIENT_ID, GOOGLE_GBP_CLIENT_SECRET, and GOOGLE_GBP_REFRESH_TOKEN.",
      },
      { status: 503 }
    );
  }

  const parent = `accounts/${accountId}/locations/${locationId}`;
  const url = `https://mybusiness.googleapis.com/v4/${parent}/reviews?pageSize=50&orderBy=updateTime%20desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      {
        ok: false,
        error: `Google API error: ${res.status}. ${text.slice(0, 200)}`,
      },
      { status: 502 }
    );
  }

  const data = (await res.json()) as ListReviewsResponse;
  const reviews = (data.reviews ?? []).map((r) => {
    const rating =
      r.starRating && STAR_TO_NUMBER[r.starRating] != null
        ? STAR_TO_NUMBER[r.starRating]
        : 5;
    const author =
      r.reviewer?.isAnonymous !== true && r.reviewer?.displayName
        ? r.reviewer.displayName
        : "Anonymous";
    return {
      reviewId: r.reviewId ?? r.name?.split("/").pop() ?? "",
      quote: (r.comment ?? "").trim(),
      author,
      rating,
      createTime: r.createTime ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    reviews,
    totalReviewCount: data.totalReviewCount ?? reviews.length,
    averageRating: data.averageRating ?? null,
  });
}
