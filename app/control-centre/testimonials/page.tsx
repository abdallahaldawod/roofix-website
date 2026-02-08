"use client";

import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { refreshPublicSiteCache } from "../actions";
import type { Testimonial } from "@/lib/firestore-types";
import { Plus, Pencil, Trash2, Star, Download } from "lucide-react";

type GoogleReview = {
  reviewId: string;
  quote: string;
  author: string;
  rating: number;
  createTime: string | null;
};

const TESTIMONIALS_COLLECTION = "testimonials";

function toTestimonial(docId: string, data: Record<string, unknown>): Testimonial & { id: string } {
  return {
    id: docId,
    quote: (data.quote as string) ?? "",
    author: (data.author as string) ?? "",
    location: (data.location as string) ?? undefined,
    rating: typeof data.rating === "number" ? data.rating : 5,
    order: typeof data.order === "number" ? data.order : undefined,
  };
}

export default function ControlCentreTestimonialsPage() {
  const [testimonials, setTestimonials] = useState<(Testimonial & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Testimonial>>({
    quote: "",
    author: "",
    location: "",
    rating: 5,
  });
  const [googleReviews, setGoogleReviews] = useState<GoogleReview[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [addingReviewId, setAddingReviewId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, TESTIMONIALS_COLLECTION));
      const list = snap.docs.map((d) => toTestimonial(d.id, d.data()));
      list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setTestimonials(list);
    } catch (e) {
      console.error(e);
      setTestimonials([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm({ quote: "", author: "", location: "", rating: 5 });
  }

  function openEdit(t: Testimonial & { id: string }) {
    setEditing(t.id);
    setCreating(false);
    setForm({
      quote: t.quote,
      author: t.author,
      location: t.location ?? "",
      rating: t.rating ?? 5,
    });
  }

  async function saveCreate() {
    if (!form.quote?.trim() || !form.author?.trim()) return;
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, TESTIMONIALS_COLLECTION), {
        quote: form.quote.trim(),
        author: form.author.trim(),
        location: (form.location ?? "").trim() || null,
        rating: typeof form.rating === "number" ? form.rating : 5,
        order: testimonials.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCreating(false);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to create testimonial.");
    }
  }

  async function saveEdit() {
    if (!editing || !form.quote?.trim() || !form.author?.trim()) return;
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, TESTIMONIALS_COLLECTION, editing), {
        quote: form.quote.trim(),
        author: form.author.trim(),
        location: (form.location ?? "").trim() || null,
        rating: typeof form.rating === "number" ? form.rating : 5,
        updatedAt: serverTimestamp(),
      });
      setEditing(null);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to update testimonial.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this testimonial?")) return;
    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, TESTIMONIALS_COLLECTION, id));
      setEditing(null);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to delete testimonial.");
    }
  }

  async function fetchGoogleReviews() {
    setGoogleError(null);
    setGoogleLoading(true);
    setGoogleReviews([]);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setGoogleError("Sign in required.");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/control-centre/google-reviews", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        ok: boolean;
        reviews?: GoogleReview[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setGoogleError(json.error ?? `Error ${res.status}`);
        return;
      }
      setGoogleReviews(json.reviews ?? []);
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : "Failed to fetch reviews.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function addGoogleReviewAsTestimonial(review: GoogleReview) {
    if (!review.quote.trim() || !review.author.trim()) return;
    setAddingReviewId(review.reviewId);
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, TESTIMONIALS_COLLECTION), {
        quote: review.quote.trim(),
        author: review.author.trim(),
        location: null,
        rating: review.rating,
        order: testimonials.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to add testimonial.");
    } finally {
      setAddingReviewId(null);
    }
  }

  const showForm = creating || editing;

  return (
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Testimonials</h1>
      <p className="mt-1 text-sm text-neutral-600 sm:text-base">Changes here are saved to Firestore and appear on the public website.</p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 sm:mt-6">
        <button
          type="button"
          onClick={fetchGoogleReviews}
          disabled={googleLoading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {googleLoading ? "Fetching…" : "Import from Google Business"}
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add testimonial
        </button>
      </div>

      {/* Google Business Profile import */}
      {(googleError || googleReviews.length > 0) && (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Import from Google Business Profile</h2>
          {googleError && (
            <div className="mt-2">
              {googleError.includes("not configured") ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Google Business Profile is optional.</p>
                  <p className="mt-1 text-amber-800">
                    To import reviews, add these to <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env.local</code> (see{" "}
                    <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env.local.example</code> for details):
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-amber-800">
                    <li><code className="rounded bg-amber-100 px-1 font-mono text-xs">GOOGLE_GBP_ACCOUNT_ID</code> — Business Profile account ID</li>
                    <li><code className="rounded bg-amber-100 px-1 font-mono text-xs">GOOGLE_GBP_LOCATION_ID</code> — Location ID</li>
                    <li><code className="rounded bg-amber-100 px-1 font-mono text-xs">GOOGLE_GBP_CLIENT_ID</code>, <code className="rounded bg-amber-100 px-1 font-mono text-xs">GOOGLE_GBP_CLIENT_SECRET</code>, <code className="rounded bg-amber-100 px-1 font-mono text-xs">GOOGLE_GBP_REFRESH_TOKEN</code> — OAuth 2.0 credentials</li>
                  </ul>
                  <p className="mt-2 text-amber-800">
                    Enable the My Business API in Google Cloud and complete the one-time OAuth flow to get a refresh token. Restart the dev server after adding env vars.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-amber-700">{googleError}</p>
              )}
            </div>
          )}
          {googleReviews.length > 0 && (
            <ul className="mt-3 space-y-3">
              {googleReviews.map((r) => (
                <li
                  key={r.reviewId}
                  className="flex flex-col gap-2 rounded-lg border border-neutral-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-neutral-900">&ldquo;{r.quote.slice(0, 120)}{r.quote.length > 120 ? "…" : ""}&rdquo;</p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
                      <span className="flex gap-0.5" aria-label={`${r.rating} stars`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-neutral-200"}`}
                            aria-hidden
                          />
                        ))}
                      </span>
                      — {r.author}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addGoogleReviewAsTestimonial(r)}
                    disabled={addingReviewId === r.reviewId}
                    className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {addingReviewId === r.reviewId ? "Adding…" : "Add to testimonials"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {loading ? (
        <p className="mt-4 text-neutral-500 sm:mt-6">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-neutral-900">&ldquo;{t.quote.slice(0, 80)}{t.quote.length > 80 ? "…" : ""}&rdquo;</p>
                <p className="mt-1 text-sm text-neutral-500">— {t.author}{t.location ? `, ${t.location}` : ""}</p>
              </div>
              <div className="flex shrink-0 gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {testimonials.length === 0 && !showForm && (
            <p className="text-neutral-500">No testimonials yet. Add one above.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6">
            <h2 className="text-lg font-semibold text-neutral-900">
              {creating ? "New testimonial" : "Edit testimonial"}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Quote</label>
                <textarea
                  value={form.quote ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Author</label>
                <input
                  type="text"
                  value={form.author ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Location (optional)</label>
                <input
                  type="text"
                  value={form.location ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Northern Beaches"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Rating (1–5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.rating ?? 5}
                  onChange={(e) => setForm((f) => ({ ...f, rating: parseInt(e.target.value, 10) || 5 }))}
                  className="mt-1 w-20 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setEditing(null); }}
                className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={creating ? saveCreate : saveEdit}
                className="min-h-[44px] rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
              >
                {creating ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
