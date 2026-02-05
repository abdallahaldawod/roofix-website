"use client";

import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { uploadImage } from "@/lib/firebase/upload";
import { refreshPublicSiteCache } from "../actions";
import type { Project, ProjectCategory } from "@/lib/firestore-types";
import { Plus, Pencil, Trash2, Upload, X } from "lucide-react";

const PROJECTS_COLLECTION = "projects";
const SLUG_REGEX = /^[a-z0-9-]+$/;
function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
const CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: "roofing", label: "Roofing" },
  { value: "gutters", label: "Gutters" },
  { value: "repairs", label: "Repairs" },
];

function toProject(docId: string, data: Record<string, unknown>): Project & { id: string } {
  return {
    id: docId,
    title: (data.title as string) ?? "",
    suburb: (data.suburb as string) ?? "",
    description: (data.description as string) ?? "",
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    category: (data.category as ProjectCategory) ?? "roofing",
    imageUrls: Array.isArray(data.imageUrls) ? (data.imageUrls as string[]) : [],
    order: typeof data.order === "number" ? data.order : undefined,
  };
}

export default function ControlCentreProjectsPage() {
  const [projects, setProjects] = useState<(Project & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Project> & { slug?: string }>({
    title: "",
    suburb: "",
    description: "",
    tags: [],
    category: "roofing",
    imageUrls: [],
    slug: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, PROJECTS_COLLECTION));
      const list = snap.docs.map((d) => toProject(d.id, d.data()));
      list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setProjects(list);
    } catch (e) {
      console.error(e);
      setProjects([]);
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
    setForm({
      title: "",
      suburb: "",
      description: "",
      tags: [],
      category: "roofing",
      imageUrls: [],
      slug: "",
    });
    setTagInput("");
  }

  function openEdit(p: Project & { id: string }) {
    setEditing(p.id);
    setCreating(false);
    setForm({
      title: p.title,
      suburb: p.suburb,
      description: p.description,
      tags: p.tags ?? [],
      category: p.category,
      imageUrls: p.imageUrls ?? [],
      slug: p.id,
    });
    setTagInput("");
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || form.tags?.includes(t)) return;
    setForm((prev) => ({ ...prev, tags: [...(prev.tags ?? []), t] }));
    setTagInput("");
  }

  function removeTag(t: string) {
    setForm((prev) => ({ ...prev, tags: (prev.tags ?? []).filter((x) => x !== t) }));
  }

  function getUploadErrorMessage(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("storage/unauthorized") || msg.includes("permission")) {
      return (
        "Storage permission denied. Deploy the storage rules from this project:\n\n" +
        "  npm run deploy:storage\n\n" +
        "Or: firebase deploy --only storage\n\n" +
        "Then try uploading again."
      );
    }
    return "Upload failed. Check Firebase Storage is enabled and that you're signed in.";
  }

  async function handleUploadImage(file: File, existingUrls: string[]) {
    try {
      const url = await uploadImage(file, "projects");
      setForm((prev) => ({ ...prev, imageUrls: [...(existingUrls ?? []), url] }));
      return url;
    } catch (e) {
      console.error(e);
      alert(getUploadErrorMessage(e));
      return null;
    }
  }

  async function handleUploadImages(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      let urls = form.imageUrls ?? [];
      for (const file of files) {
        const url = await uploadImage(file, "projects");
        urls = [...urls, url];
        setForm((prev) => ({ ...prev, imageUrls: urls }));
      }
    } catch (e) {
      console.error(e);
      alert(getUploadErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setForm((prev) => ({ ...prev, imageUrls: (prev.imageUrls ?? []).filter((u) => u !== url) }));
  }

  async function saveCreate() {
    if (!form.title?.trim()) return;
    const slug = normalizeSlug(form.slug ?? "").trim();
    if (slug && !SLUG_REGEX.test(slug)) {
      alert("Slug can only contain lowercase letters, numbers, and hyphens.");
      return;
    }
    setSaving(true);
    try {
      const db = getFirestoreDb();
      const payload = {
        title: form.title.trim(),
        suburb: (form.suburb ?? "").trim(),
        description: (form.description ?? "").trim(),
        tags: form.tags ?? [],
        category: form.category ?? "roofing",
        imageUrls: form.imageUrls ?? [],
        order: projects.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      let newId: string;
      if (slug) {
        const existing = await getDoc(doc(db, PROJECTS_COLLECTION, slug));
        if (existing.exists()) {
          alert("A project with this slug already exists. Choose another.");
          setSaving(false);
          return;
        }
        await setDoc(doc(db, PROJECTS_COLLECTION, slug), payload);
        newId = slug;
      } else {
        const ref = await addDoc(collection(db, PROJECTS_COLLECTION), payload);
        newId = ref.id;
      }
      setCreating(false);
      await load();
      await refreshPublicSiteCache(newId);
      alert("Project saved to the database. It will appear on the website.");
    } catch (e) {
      console.error(e);
      alert("Failed to save project to the database. Check the console for details.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing || !form.title?.trim()) return;
    const newSlug = normalizeSlug(form.slug ?? "").trim();
    if (!newSlug || !SLUG_REGEX.test(newSlug)) {
      alert("Slug is required and can only contain lowercase letters, numbers, and hyphens.");
      return;
    }
    setSaving(true);
    try {
      const db = getFirestoreDb();
      const payload = {
        title: form.title.trim(),
        suburb: (form.suburb ?? "").trim(),
        description: (form.description ?? "").trim(),
        tags: form.tags ?? [],
        category: form.category ?? "roofing",
        imageUrls: form.imageUrls ?? [],
        updatedAt: serverTimestamp(),
      };
      if (newSlug !== editing) {
        const existing = await getDoc(doc(db, PROJECTS_COLLECTION, newSlug));
        if (existing.exists()) {
          alert("A project with this slug already exists. Choose another.");
          setSaving(false);
          return;
        }
        const oldRef = doc(db, PROJECTS_COLLECTION, editing);
        const oldSnap = await getDoc(oldRef);
        const order = (oldSnap.data()?.order as number) ?? 9999;
        await setDoc(doc(db, PROJECTS_COLLECTION, newSlug), { ...payload, order, createdAt: oldSnap.data()?.createdAt });
        await deleteDoc(oldRef);
        await refreshPublicSiteCache(newSlug);
        await refreshPublicSiteCache(editing);
      } else {
        await updateDoc(doc(db, PROJECTS_COLLECTION, editing), payload);
        await refreshPublicSiteCache(editing);
      }
      setEditing(null);
      await load();
      alert("Project saved to the database. Changes will appear on the website.");
    } catch (e) {
      console.error(e);
      alert("Failed to save project to the database. Check the console for details.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this project?")) return;
    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, PROJECTS_COLLECTION, id));
      setEditing(null);
      load();
      await refreshPublicSiteCache(id);
    } catch (e) {
      console.error(e);
      alert("Failed to delete project.");
    }
  }

  const showForm = creating || editing;

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Projects</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Changes here are saved to Firestore and appear on the public website.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add project
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-neutral-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">{p.title}</p>
                <p className="text-sm text-neutral-500">{p.suburb} · {p.category}</p>
                <p className="text-xs text-neutral-400 font-mono">/projects/{p.id}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 && !showForm && (
            <p className="text-neutral-500">No projects yet. Add one above.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-neutral-900">
              {creating ? "New project" : "Edit project"}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">URL slug</label>
                <input
                  type="text"
                  value={form.slug ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  onBlur={(e) => {
                    const v = normalizeSlug(e.target.value);
                    if (v !== (form.slug ?? "")) setForm((f) => ({ ...f, slug: v }));
                  }}
                  placeholder={creating ? "e.g. full-roof-manly (optional, auto-generated if empty)" : "e.g. website-0"}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm text-neutral-900"
                />
                <p className="mt-0.5 text-xs text-neutral-500">
                  Used in URL: /projects/[slug]. Lowercase letters, numbers, hyphens only.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Title</label>
                <input
                  type="text"
                  value={form.title ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Suburb</label>
                <input
                  type="text"
                  value={form.suburb ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Category</label>
                <select
                  value={form.category ?? "roofing"}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ProjectCategory }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Description</label>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Tags</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(form.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm"
                    >
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="text-neutral-500 hover:text-neutral-700">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                      placeholder="Add tag"
                      className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <button type="button" onClick={addTag} className="rounded bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-200">
                      Add
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Images</label>
                <p className="mt-0.5 text-xs text-neutral-500">Uploaded to Firebase Storage. First image is shown on the website.</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(form.imageUrls ?? []).map((url) => (
                    <div key={url} className="relative">
                      <img src={url} alt="" className="h-20 w-20 rounded object-cover border border-neutral-200" />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                        aria-label="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-neutral-300 hover:border-accent hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      disabled={uploading}
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files?.length) handleUploadImages(Array.from(files));
                        e.target.value = "";
                      }}
                    />
                    {uploading ? (
                      <span className="text-xs text-neutral-500">Uploading…</span>
                    ) : (
                      <>
                        <Upload className="h-6 w-6 text-neutral-400" />
                        <span className="text-xs text-neutral-500">Add image</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setEditing(null); }}
                disabled={saving}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={creating ? saveCreate : saveEdit}
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : creating ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
