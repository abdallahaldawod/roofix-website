"use client";

import { useState, useEffect, useRef } from "react";
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
import type { ProjectFilterCategory } from "@/lib/data";
import { Plus, Pencil, Trash2, Upload, X, GripVertical, Save, PlusCircle } from "lucide-react";

const PROJECTS_COLLECTION = "projects";
const CONFIG_COLLECTION = "config";
const PROJECT_FILTERS_DOC = "projectFilters";
const SLUG_REGEX = /^[a-z0-9-]+$/;

const DEFAULT_FILTER_CATEGORIES: ProjectFilterCategory[] = [
  { value: "roofing", label: "Roofing" },
  { value: "gutters", label: "Gutters" },
  { value: "repairs", label: "Repairs" },
];

function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Generate a URL-safe project id for use as slug (e.g. project-a1b2c3d4). */
function generateProjectId(): string {
  const segment = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `project-${segment}`;
}
/** Firestore does not accept undefined; strip so only defined fields are written. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out as T;
}

function toProject(docId: string, data: Record<string, unknown>): Project & { id: string } {
  const slugFromDb = data.slug;
  const slug =
    typeof slugFromDb === "string" && slugFromDb.length > 0 ? slugFromDb : docId;
  return {
    id: docId,
    slug,
    title: (data.title as string) ?? "",
    suburb: (data.suburb as string) ?? "",
    description: (data.description as string) ?? "",
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    category: typeof data.category === "string" ? data.category : "roofing",
    imageUrls: Array.isArray(data.imageUrls) ? (data.imageUrls as string[]) : [],
    order: typeof data.order === "number" ? data.order : undefined,
    roofType: typeof data.roofType === "string" ? data.roofType : undefined,
    roofSizeM2: typeof data.roofSizeM2 === "number" ? data.roofSizeM2 : undefined,
    durationDays: typeof data.durationDays === "number" ? data.durationDays : undefined,
    materials: Array.isArray(data.materials) ? (data.materials as string[]) : undefined,
    problem: typeof data.problem === "string" ? data.problem : undefined,
    solution: typeof data.solution === "string" ? data.solution : undefined,
    result: typeof data.result === "string" ? data.result : undefined,
    testimonialQuote: typeof data.testimonialQuote === "string" ? data.testimonialQuote : undefined,
    testimonialAuthor: typeof data.testimonialAuthor === "string" ? data.testimonialAuthor : undefined,
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
    roofType: "",
    roofSizeM2: undefined,
    durationDays: undefined,
    materials: [],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCategories, setFilterCategories] = useState<ProjectFilterCategory[]>(DEFAULT_FILTER_CATEGORIES);
  const [filterCategoriesSaving, setFilterCategoriesSaving] = useState(false);
  const [filterCategoriesLoaded, setFilterCategoriesLoaded] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const savedFilterCategoriesRef = useRef<ProjectFilterCategory[]>([]);

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

  async function loadFilterCategories() {
    let loaded: ProjectFilterCategory[] = DEFAULT_FILTER_CATEGORIES;
    try {
      const db = getFirestoreDb();
      const snap = await getDoc(doc(db, CONFIG_COLLECTION, PROJECT_FILTERS_DOC));
      const data = snap.data();
      const categories = data?.categories;
      if (Array.isArray(categories) && categories.length > 0) {
        loaded = categories
          .filter((c: unknown) => c && typeof c === "object" && "value" in c && "label" in c)
          .map((c: { value: string; label: string }) => ({ value: String(c.value), label: String(c.label) }));
        setFilterCategories(loaded);
      } else {
        setFilterCategories(loaded);
      }
    } catch (e) {
      console.error(e);
      setFilterCategories(loaded);
    } finally {
      savedFilterCategoriesRef.current = loaded.map((c) => ({ ...c }));
      setFilterCategoriesLoaded(true);
    }
  }

  useEffect(() => {
    loadFilterCategories();
  }, []);

  async function saveFilterCategories() {
    setFilterCategoriesSaving(true);
    try {
      const db = getFirestoreDb();
      await setDoc(
        doc(db, CONFIG_COLLECTION, PROJECT_FILTERS_DOC),
        { categories: filterCategories, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await refreshPublicSiteCache();
      savedFilterCategoriesRef.current = filterCategories.map((c) => ({ ...c }));
      alert("Filter tabs saved. They will appear on the public Projects page.");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = /permission|insufficient|denied/i.test(msg);
      alert(
        isPermission
          ? "Missing or insufficient permissions. Ensure you're signed in and your user is in the Firestore 'users' collection with role: 'admin'."
          : "Failed to save filter tabs."
      );
    } finally {
      setFilterCategoriesSaving(false);
    }
  }

  function moveFilterCategory(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= filterCategories.length) return;
    const copy = [...filterCategories];
    const tmp = copy[index];
    copy[index] = copy[next]!;
    copy[next] = tmp!;
    setFilterCategories(copy);
  }

  function removeFilterCategory(value: string) {
    setFilterCategories((prev) => prev.filter((c) => c.value !== value));
  }

  function addFilterCategory(value: ProjectCategory) {
    const defaultLabel = DEFAULT_FILTER_CATEGORIES.find((c) => c.value === value)?.label ?? value;
    if (filterCategories.some((c) => c.value === value)) return;
    setFilterCategories((prev) => [...prev, { value, label: defaultLabel }]);
  }

  const availableToAdd = (DEFAULT_FILTER_CATEGORIES.map((c) => c.value) as ProjectCategory[]).filter(
    (value) => !filterCategories.some((c) => c.value === value)
  );

  function slugifyCategory(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  function addCustomCategory() {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const value = slugifyCategory(label);
    if (!value) return;
    if (filterCategories.some((c) => c.value === value)) {
      alert(`Category "${value}" already exists.`);
      return;
    }
    setFilterCategories((prev) => [...prev, { value, label }]);
    setNewCategoryLabel("");
  }

  const filterCategoriesDirty =
    filterCategories.length !== savedFilterCategoriesRef.current.length ||
    filterCategories.some(
      (c, i) => {
        const s = savedFilterCategoriesRef.current[i];
        return !s || s.value !== c.value || s.label !== c.label;
      }
    );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    const defaultCategory = filterCategories[0]?.value ?? "roofing";
    setForm({
      title: "",
      suburb: "",
      description: "",
      tags: [],
      category: defaultCategory,
      imageUrls: [],
      slug: generateProjectId(),
      roofType: "",
      roofSizeM2: undefined,
      durationDays: undefined,
      materials: [],
    });
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
      slug: p.slug ?? p.id,
      roofType: p.roofType ?? "",
      roofSizeM2: p.roofSizeM2,
      durationDays: p.durationDays,
      materials: p.materials ?? [],
    });
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
    let slug = normalizeSlug(form.slug ?? "").trim();
    if (!slug) slug = generateProjectId();
    if (!SLUG_REGEX.test(slug)) {
      alert("Slug can only contain lowercase letters, numbers, and hyphens.");
      return;
    }
    setSaving(true);
    try {
      const db = getFirestoreDb();
      const basePayload = stripUndefined({
        title: form.title.trim(),
        suburb: (form.suburb ?? "").trim(),
        description: (form.description ?? "").trim(),
        tags: form.tags ?? [],
        category: form.category ?? "roofing",
        imageUrls: form.imageUrls ?? [],
        order: projects.length,
        roofType: (form.roofType ?? "").trim() || undefined,
        roofSizeM2: form.roofSizeM2,
        durationDays: form.durationDays,
        materials: form.materials ?? [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const existing = await getDoc(doc(db, PROJECTS_COLLECTION, slug));
      if (existing.exists()) {
        alert("A project with this slug already exists. Choose another or regenerate the slug.");
        setSaving(false);
        return;
      }
      await setDoc(doc(db, PROJECTS_COLLECTION, slug), {
        slug,
        ...basePayload,
      });
      const newId = slug;
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
      const basePayload = stripUndefined({
        title: form.title.trim(),
        suburb: (form.suburb ?? "").trim(),
        description: (form.description ?? "").trim(),
        tags: form.tags ?? [],
        category: form.category ?? "roofing",
        imageUrls: form.imageUrls ?? [],
        roofType: (form.roofType ?? "").trim() || undefined,
        roofSizeM2: form.roofSizeM2,
        durationDays: form.durationDays,
        materials: form.materials ?? [],
        updatedAt: serverTimestamp(),
      });
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
        const existingCreatedAt = oldSnap.data()?.createdAt;
        await setDoc(doc(db, PROJECTS_COLLECTION, newSlug), {
          slug: newSlug,
          ...basePayload,
          order,
          createdAt: existingCreatedAt != null ? existingCreatedAt : serverTimestamp(),
        });
        await deleteDoc(oldRef);
        await refreshPublicSiteCache(newSlug);
        await refreshPublicSiteCache(editing);
      } else {
        await updateDoc(doc(db, PROJECTS_COLLECTION, editing), {
          slug: editing,
          ...basePayload,
        });
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
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Projects</h1>
      <p className="mt-1 text-sm text-neutral-500 sm:mt-2">
        Changes here are saved to Firestore and appear on the public website.
      </p>

      {/* Project filter tabs (All, Roofing, Gutters, Repairs) shown on /projects */}
      <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:mt-6 sm:p-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Project filter tabs</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Labels and order of the filter buttons in the grey section on the public Projects page. After saving, refresh the public page to see changes.
          </p>
        </div>
        {!filterCategoriesLoaded ? (
          <p className="mt-3 text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {filterCategories.map((cat, index) => (
                <div
                  key={cat.value}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/50 p-2 sm:flex-nowrap"
                >
                  <span className="text-neutral-400" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      setFilterCategories((prev) =>
                        prev.map((c) => (c.value === cat.value ? { ...c, label } : c))
                      );
                    }}
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-2 text-sm text-neutral-900"
                    placeholder="Tab label"
                    aria-label={`Filter tab for ${cat.value}`}
                  />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveFilterCategory(index, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-40"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFilterCategory(index, 1)}
                      disabled={index === filterCategories.length - 1}
                      className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-40"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFilterCategory(cat.value)}
                      className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${cat.label}`}
                      title="Remove tab"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {availableToAdd.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500">Add tab:</span>
                {availableToAdd.map((value) => {
                  const defaultLabel = DEFAULT_FILTER_CATEGORIES.find((c) => c.value === value)?.label ?? value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => addFilterCategory(value)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      <PlusCircle className="h-4 w-4" /> {defaultLabel}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">Add custom category:</span>
              <input
                type="text"
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomCategory())}
                placeholder="e.g. Roof Restoration"
                className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={addCustomCategory}
                disabled={!newCategoryLabel.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                <PlusCircle className="h-4 w-4" /> Add
              </button>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={saveFilterCategories}
                disabled={!filterCategoriesDirty || filterCategoriesSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {filterCategoriesSaving ? "Saving…" : "Save filter tabs"}
              </button>
            </div>
          </>
        )}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 sm:mt-6">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add project
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-neutral-500 sm:mt-6">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900">{p.title}</p>
                <p className="text-sm text-neutral-500">{p.suburb} · {p.category}</p>
                <p className="mt-1 break-all text-xs text-neutral-500">
                  <span className="font-medium text-neutral-600">URL slug:</span>{" "}
                  <span className="font-mono">{(p.slug ?? p.id) || "—"}</span>
                  {" · "}
                  <span className="font-mono">/projects/{(p.slug ?? p.id) || p.id}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6">
            <h2 className="text-lg font-semibold text-neutral-900">
              {creating ? "New project" : "Edit project"}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Project ID / URL slug</label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={form.slug ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    onBlur={(e) => {
                      const v = normalizeSlug(e.target.value);
                      if (v !== (form.slug ?? "")) setForm((f) => ({ ...f, slug: v }));
                    }}
                    placeholder={creating ? "Auto-generated" : "e.g. project1"}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                  {creating && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, slug: generateProjectId() }))}
                      className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:py-2"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Used as document ID and in URL: /projects/[slug]. Lowercase letters, numbers, hyphens only.
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
                  value={form.category ?? filterCategories[0]?.value ?? "roofing"}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                >
                  {filterCategories.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-neutral-200 pt-4">
                <p className="text-sm font-semibold text-neutral-700">Project summary strip</p>
                <p className="mt-0.5 text-xs text-neutral-500">Shown on the project page (Roof type, Size, Duration, Materials).</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Roof type</label>
                    <input
                      type="text"
                      value={form.roofType ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, roofType: e.target.value }))}
                      placeholder="e.g. Colorbond, Tile"
                      className="mt-0.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Roof size (m²)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.roofSizeM2 ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        setForm((f) => ({ ...f, roofSizeM2: v }));
                      }}
                      placeholder="—"
                      className="mt-0.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Duration (days)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.durationDays ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        setForm((f) => ({ ...f, durationDays: v }));
                      }}
                      placeholder="—"
                      className="mt-0.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-neutral-600">Materials</label>
                  <input
                    type="text"
                    value={(form.materials ?? []).join(", ")}
                    onChange={(e) => {
                      const value = e.target.value;
                      const list = value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setForm((f) => ({ ...f, materials: list }));
                    }}
                    placeholder="e.g. Colorbond, Tile"
                    className="mt-0.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                </div>
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
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setEditing(null); }}
                disabled={saving}
                className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={creating ? saveCreate : saveEdit}
                disabled={saving}
                className="min-h-[44px] rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover disabled:opacity-50"
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
