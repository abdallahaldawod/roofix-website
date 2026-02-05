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
import type { Service, ServiceIcon } from "@/lib/firestore-types";
import { refreshPublicSiteCache } from "../actions";
import {
  Plus,
  Pencil,
  Trash2,
  Home,
  Droplets,
  Wrench,
  ClipboardCheck,
  Settings,
  AlertCircle,
  Building2,
  type LucideIcon,
} from "lucide-react";

const SERVICES_COLLECTION = "services";
const ICON_MAP: Record<ServiceIcon, { label: string; Icon: LucideIcon }> = {
  roof: { label: "Roof", Icon: Home },
  gutter: { label: "Gutter", Icon: Droplets },
  repair: { label: "Repair", Icon: Wrench },
  inspection: { label: "Inspection", Icon: ClipboardCheck },
  maintenance: { label: "Maintenance", Icon: Settings },
  emergency: { label: "Emergency", Icon: AlertCircle },
  strata: { label: "Strata", Icon: Building2 },
};
const ICONS = Object.entries(ICON_MAP).map(([value, { label }]) => ({
  value: value as ServiceIcon,
  label,
}));

function toService(docId: string, data: Record<string, unknown>): Service & { id: string } {
  return {
    id: docId,
    slug: (data.slug as string) ?? "",
    title: (data.title as string) ?? "",
    description: (data.description as string) ?? "",
    icon: (data.icon as ServiceIcon) ?? "roof",
    content: Array.isArray(data.content) ? (data.content as string[]) : [],
    active: data.active === undefined ? true : !!data.active,
    order: typeof data.order === "number" ? data.order : undefined,
  };
}

export default function ServicesCrud() {
  const [services, setServices] = useState<(Service & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Service>>({
    slug: "",
    title: "",
    description: "",
    icon: "roof",
    content: [],
    active: true,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, SERVICES_COLLECTION));
      const list = snap.docs.map((d) => toService(d.id, d.data()));
      list.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      setServices(list);
    } catch (e) {
      console.error(e);
      setServices([]);
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
    setDeleteConfirm(null);
    setForm({
      slug: "",
      title: "",
      description: "",
      icon: "roof",
      content: [],
      active: true,
    });
  }

  function openEdit(s: Service & { id: string }) {
    setEditing(s.id);
    setCreating(false);
    setDeleteConfirm(null);
    setForm({
      slug: s.slug,
      title: s.title,
      description: s.description,
      icon: s.icon,
      content: s.content ?? [],
      active: s.active !== false,
    });
  }

  async function saveCreate() {
    if (!form.slug?.trim() || !form.title?.trim()) return;
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, SERVICES_COLLECTION), {
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        title: form.title.trim(),
        description: (form.description ?? "").trim(),
        icon: form.icon ?? "roof",
        content: form.content ?? [],
        active: form.active !== false,
        order: services.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCreating(false);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to create service.");
    }
  }

  async function saveEdit() {
    if (!editing || !form.slug?.trim() || !form.title?.trim()) return;
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, SERVICES_COLLECTION, editing), {
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        title: form.title.trim(),
        description: (form.description ?? "").trim(),
        icon: form.icon ?? "roof",
        content: form.content ?? [],
        active: form.active !== false,
        updatedAt: serverTimestamp(),
      });
      setEditing(null);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to update service.");
    }
  }

  async function toggleActive(s: Service & { id: string }) {
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, SERVICES_COLLECTION, s.id), {
        active: !(s.active !== false),
        updatedAt: serverTimestamp(),
      });
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to update service.");
    }
  }

  function openDeleteConfirm(s: Service & { id: string }) {
    setDeleteConfirm({ id: s.id, title: s.title });
    setEditing(null);
    setCreating(false);
  }

  async function remove(id: string) {
    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, SERVICES_COLLECTION, id));
      setDeleteConfirm(null);
      setEditing(null);
      load();
      await refreshPublicSiteCache();
    } catch (e) {
      console.error(e);
      alert("Failed to delete service.");
    }
  }

  const showForm = creating || editing;

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Manage services in Firestore</h2>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Add service
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-neutral-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {services.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm ${s.active === false ? "opacity-70" : ""}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-neutral-900">{s.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.active !== false ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"}`}
                  >
                    {s.active !== false ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-neutral-500">/{s.slug}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  title={s.active !== false ? "Set inactive" : "Set active"}
                >
                  {s.active !== false ? "Set inactive" : "Set active"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteConfirm(s)}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {services.length === 0 && !showForm && (
            <p className="text-neutral-500">No services in Firestore yet. Add one above.</p>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-neutral-900">Delete service?</h3>
            <p className="mt-2 text-neutral-600">
              Are you sure you want to delete <strong>{deleteConfirm.title}</strong>? This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => remove(deleteConfirm.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-neutral-900">
              {creating ? "New service" : "Edit service"}
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Slug (URL path)</label>
                <input
                  type="text"
                  value={form.slug ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="e.g. new-roof"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
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
                <label className="block text-sm font-medium text-neutral-700">Short description</label>
                <input
                  type="text"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Icon</label>
                <div className="mt-1 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 text-accent" aria-hidden>
                    {(() => {
                      const { Icon } = ICON_MAP[form.icon ?? "roof"];
                      return <Icon className="h-5 w-5" />;
                    })()}
                  </span>
                  <select
                    value={form.icon ?? "roof"}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value as ServiceIcon }))}
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                  >
                    {ICONS.map((i) => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Content paragraphs (one per line)</label>
                <textarea
                  value={(form.content ?? []).join("\n")}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value.split("\n").filter(Boolean) }))}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setEditing(null); }}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={creating ? saveCreate : saveEdit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-accent-hover"
              >
                {creating ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
