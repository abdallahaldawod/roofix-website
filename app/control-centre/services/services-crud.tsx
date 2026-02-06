"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
import { Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import { AppIcon } from "@/components/ui/AppIcon";
import {
  SERVICE_ICON_OPTIONS,
  getServiceIconifyName,
} from "@/lib/service-icons";

const SERVICES_COLLECTION = "services";

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
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerPosition, setIconPickerPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const iconPickerDropdownRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

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

  function measureIconPickerPosition() {
    const el = iconPickerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxW = typeof window !== "undefined" ? Math.min(360, window.innerWidth - 32) : 360;
    const width = Math.min(Math.max(320, rect.width), maxW);
    const left = typeof window !== "undefined"
      ? Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))
      : rect.left;
    setIconPickerPosition({
      top: rect.bottom + 8,
      left,
      width,
    });
  }

  useEffect(() => {
    if (!iconPickerOpen) {
      setIconPickerPosition(null);
      return;
    }
    measureIconPickerPosition();
    const scrollEl = modalContentRef.current ?? document.documentElement;
    const handleScrollOrResize = () => measureIconPickerPosition();
    window.addEventListener("resize", handleScrollOrResize);
    scrollEl.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      scrollEl.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [iconPickerOpen]);

  useEffect(() => {
    if (!iconPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        iconPickerRef.current?.contains(target) ||
        iconPickerDropdownRef.current?.contains(target)
      )
        return;
      setIconPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [iconPickerOpen]);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setDeleteConfirm(null);
    setIconPickerOpen(false);
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
    setIconPickerOpen(false);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Manage services in Firestore</h2>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-accent-hover sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Add service
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-neutral-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3 sm:space-y-4">
          {services.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4 ${s.active === false ? "opacity-70" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-neutral-900">{s.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.active !== false ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"}`}
                  >
                    {s.active !== false ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-neutral-500">/{s.slug}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  className="min-h-[40px] rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  title={s.active !== false ? "Set inactive" : "Set active"}
                >
                  {s.active !== false ? "Set inactive" : "Set active"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteConfirm(s)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
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

      {deleteConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc"
          >
            <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600" aria-hidden>
                  <Trash2 className="h-5 w-5" />
                </span>
                <h3 id="delete-dialog-title" className="text-lg font-semibold text-neutral-900">
                  Delete service?
                </h3>
              </div>
              <p id="delete-dialog-desc" className="mt-3 text-sm text-neutral-600">
                Are you sure you want to delete <strong className="font-medium text-neutral-900">{deleteConfirm.title}</strong>? This cannot be undone.
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
          </div>,
          document.body
        )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div
            ref={modalContentRef}
            className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl sm:p-6"
          >
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
              <div ref={iconPickerRef} className="relative">
                <label className="block text-sm font-medium text-neutral-700">Icon</label>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIconPickerOpen((v) => !v)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 text-accent transition-colors hover:border-neutral-400 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                    aria-label="Choose icon"
                    aria-expanded={iconPickerOpen}
                    aria-haspopup="listbox"
                  >
                    <AppIcon
                      name={getServiceIconifyName((form.icon ?? "roof") as ServiceIcon)}
                      size={20}
                      className="text-accent"
                    />
                  </button>
                  <span className="text-sm text-neutral-600">
                    {SERVICE_ICON_OPTIONS.find((o) => o.value === (form.icon ?? "roof"))?.label ?? "Roof"}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${iconPickerOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
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

      {iconPickerOpen &&
        iconPickerPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={iconPickerDropdownRef}
            role="listbox"
            aria-label="Icon library"
            className="fixed z-[100] max-h-[min(85vh,560px)] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
            style={{
              top: iconPickerPosition.top,
              left: iconPickerPosition.left,
              width: iconPickerPosition.width,
            }}
          >
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {SERVICE_ICON_OPTIONS.map(({ value, label, iconifyName }) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={form.icon === value}
                  onClick={() => {
                    setForm((f) => ({ ...f, icon: value }));
                    setIconPickerOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-colors hover:bg-neutral-50 ${
                    form.icon === value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-transparent text-neutral-600"
                  }`}
                  title={label}
                >
                  <AppIcon name={iconifyName} size={24} className="shrink-0" />
                  <span className="text-xs font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
