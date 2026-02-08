"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useControlCentreBase } from "../../../use-base-path";
import type { HomeContent, AboutContent, ContactContent, PageId } from "@/lib/page-content";
import { getDefaultPageContent } from "@/lib/page-content";
import { ArrowLeft, Save, ExternalLink, RefreshCw, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const PAGE_IDS: PageId[] = ["home", "about", "contact"];
const PUBLIC_SITE_ORIGIN =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://roofix.com.au";

const PREVIEW_PATHS: Record<PageId, string> = {
  home: "/home",
  about: "/about",
  contact: "/contact",
};

function isPageId(id: string): id is PageId {
  return PAGE_IDS.includes(id as PageId);
}

/** Parse JSON from fetch response; if server returns HTML (e.g. error/login page), throw a clear error. */
async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const status = res.status;
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") || text.trimStart().startsWith("<")) {
    const msg =
      status === 404
        ? "API not found (404). The page editor API may not be available on this deployment."
        : status === 401 || status === 403
          ? "Please log in again to edit pages."
          : `Server returned an unexpected response (status ${status}). Try logging in again or refresh the page.`;
    throw new Error(msg);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid response from server. Try again.");
  }
}

export default function EditPagePage() {
  const params = useParams();
  const router = useRouter();
  const base = useControlCentreBase();
  const pageId = typeof params.pageId === "string" ? params.pageId : "";
  const [content, setContent] = useState<HomeContent | AboutContent | ContactContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [editorSidebarOpen, setEditorSidebarOpen] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isPageId(pageId)) return;
    const previewPath = PREVIEW_PATHS[pageId];
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    const origin = isLocalhost ? window.location.origin : PUBLIC_SITE_ORIGIN;
    setPreviewUrl(`${origin}${previewPath}${isLocalhost ? "" : "?preview=1"}`);
  }, [pageId]);

  const fetchContent = useCallback(async () => {
    if (!isPageId(pageId)) return;
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        router.replace(base ? `${base}/login` : "/login");
        return;
      }
      const token = await user.getIdToken();
      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/control-centre/pages/${pageId}`
          : `/api/control-centre/pages/${pageId}`;
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJsonResponse<{ ok: boolean; content?: HomeContent | AboutContent | ContactContent; error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setContent(data.content ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load page");
      setContent(getDefaultPageContent(pageId) as HomeContent | AboutContent | ContactContent);
    } finally {
      setLoading(false);
    }
  }, [pageId, base, router]);

  useEffect(() => {
    if (isPageId(pageId)) fetchContent();
  }, [pageId, fetchContent]);

  const handleSave = async () => {
    if (!content || !isPageId(pageId)) return;
    setSaving(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/control-centre/pages/${pageId}`
          : `/api/control-centre/pages/${pageId}`;
      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(content),
      });
      const data = await parseJsonResponse<{ ok: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!isPageId(pageId)) {
    return (
      <div className="min-w-0">
        <p className="text-neutral-600">Invalid page. Use home, about, or contact.</p>
        <Link href={base ? `${base}/site-pages` : "/site-pages"} className="mt-4 inline-flex items-center gap-2 text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Pages
        </Link>
      </div>
    );
  }

  if (loading && !content) {
    return (
      <div className="min-w-0">
        <p className="text-neutral-600">Loading…</p>
      </div>
    );
  }

  const previewReady = Boolean(previewUrl);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={base ? `${base}/site-pages` : "/site-pages"}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-xl font-semibold text-neutral-900">
            Edit: {pageId.charAt(0).toUpperCase() + pageId.slice(1)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <ExternalLink className="h-4 w-4" /> View live
          </a>
          <button
            type="button"
            onClick={() => {
              if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh preview
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !content}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">{error}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fetchContent()}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Retry
            </button>
            <Link
              href={base ? `${base}/login` : "/login"}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Log in again
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-0 min-h-[560px]">
        {/* Collapsible editor sidebar */}
        <div
          className={`flex flex-col border border-neutral-200 lg:border-r bg-white transition-[width] duration-200 overflow-hidden shrink-0 ${
            editorSidebarOpen ? "w-full lg:w-[380px] lg:min-w-[300px]" : "hidden lg:flex lg:w-0"
          }`}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-neutral-200 px-3">
            <span className="text-sm font-medium text-neutral-700">Sections</span>
            <button
              type="button"
              onClick={() => setEditorSidebarOpen(false)}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 lg:flex"
              aria-label="Collapse editor"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {content && pageId === "home" && (
              <HomeEditorForm content={content as HomeContent} onChange={setContent as (c: HomeContent) => void} />
            )}
            {content && pageId === "about" && (
              <AboutEditorForm content={content as AboutContent} onChange={setContent as (c: AboutContent) => void} />
            )}
            {content && pageId === "contact" && (
              <ContactEditorForm content={content as ContactContent} onChange={setContent as (c: ContactContent) => void} />
            )}
          </div>
        </div>
        {/* Expand button when sidebar is collapsed */}
        {!editorSidebarOpen && (
          <div className="hidden lg:flex shrink-0 border-r border-neutral-200 bg-neutral-50 flex-col items-center py-2">
            <button
              type="button"
              onClick={() => setEditorSidebarOpen(true)}
              className="rounded p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Expand editor"
              title="Show editor"
            >
              <PanelLeftOpen className="h-6 w-6" />
            </button>
          </div>
        )}
        {!editorSidebarOpen && (
          <button
            type="button"
            onClick={() => setEditorSidebarOpen(true)}
            className="lg:hidden fixed bottom-4 left-4 z-20 rounded-full bg-accent p-3 text-neutral-900 shadow-lg hover:bg-accent/90"
            aria-label="Expand editor"
            title="Show editor"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        )}
        <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-r-xl border border-neutral-200 bg-neutral-100">
          {!previewReady ? (
            <div className="flex h-[480px] items-center justify-center text-neutral-500">Loading preview…</div>
          ) : (
            <iframe
              ref={iframeRef}
              title="Live preview"
              src={previewUrl}
              className="absolute left-0 top-0 h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapsible section for the editor side menu (accordion). */
function CollapsibleSection({
  id,
  title,
  children,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="truncate">{title}</span>
      </button>
      {open && <div className="border-t border-neutral-100 px-3 py-3 space-y-3">{children}</div>}
    </div>
  );
}

const HOME_SECTION_IDS = ["hero", "howItWorks", "recentProjects", "testimonials", "faq", "finalCta"] as const;

function HomeEditorForm({ content, onChange }: { content: HomeContent; onChange: (c: HomeContent) => void }) {
  const update = (partial: Partial<HomeContent>) => onChange({ ...content, ...partial });
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(HOME_SECTION_IDS.map((id) => [id, true]))
  );
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-2">
      <CollapsibleSection
        id="hero"
        title="Hero"
        open={open.hero ?? true}
        onToggle={() => toggle("hero")}
      >
        <label className="block">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            type="text"
            value={content.heroHeadline}
            onChange={(e) => update({ heroHeadline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Trust badges (one per line)</span>
          <textarea
            value={content.heroTrustBadges.join("\n")}
            onChange={(e) => update({ heroTrustBadges: e.target.value.split("\n").filter(Boolean) })}
            rows={4}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        id="howItWorks"
        title="How it works"
        open={open.howItWorks ?? true}
        onToggle={() => toggle("howItWorks")}
      >
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.howItWorksSubline}
            onChange={(e) => update({ howItWorksSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        {content.howItWorks.map((item, i) => (
          <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <span className="text-sm font-medium text-neutral-600">Step {item.step}</span>
            <input
              type="text"
              value={item.title}
              onChange={(e) => {
                const next = [...content.howItWorks];
                next[i] = { ...next[i], title: e.target.value };
                update({ howItWorks: next });
              }}
              placeholder="Title"
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <textarea
              value={item.description}
              onChange={(e) => {
                const next = [...content.howItWorks];
                next[i] = { ...next[i], description: e.target.value };
                update({ howItWorks: next });
              }}
              placeholder="Description"
              rows={2}
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        id="recentProjects"
        title="Recent Projects"
        open={open.recentProjects ?? true}
        onToggle={() => toggle("recentProjects")}
      >
        <label className="block">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            type="text"
            value={content.recentProjectsHeadline}
            onChange={(e) => update({ recentProjectsHeadline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.recentProjectsSubline}
            onChange={(e) => update({ recentProjectsSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        id="testimonials"
        title="Testimonials"
        open={open.testimonials ?? true}
        onToggle={() => toggle("testimonials")}
      >
        <label className="block">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            type="text"
            value={content.testimonialsHeadline}
            onChange={(e) => update({ testimonialsHeadline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.testimonialsSubline}
            onChange={(e) => update({ testimonialsSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection id="faq" title="FAQ" open={open.faq ?? true} onToggle={() => toggle("faq")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            type="text"
            value={content.faqHeadline}
            onChange={(e) => update({ faqHeadline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        {content.faqItems.map((item, i) => (
          <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <input
              type="text"
              value={item.question}
              onChange={(e) => {
                const next = [...content.faqItems];
                next[i] = { ...next[i], question: e.target.value };
                update({ faqItems: next });
              }}
              placeholder="Question"
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <textarea
              value={item.answer}
              onChange={(e) => {
                const next = [...content.faqItems];
                next[i] = { ...next[i], answer: e.target.value };
                update({ faqItems: next });
              }}
              placeholder="Answer"
              rows={2}
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        id="finalCta"
        title="Final CTA"
        open={open.finalCta ?? true}
        onToggle={() => toggle("finalCta")}
      >
        <label className="block">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            type="text"
            value={content.ctaHeadline}
            onChange={(e) => update({ ctaHeadline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.ctaSubline}
            onChange={(e) => update({ ctaSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Button label</span>
          <input
            type="text"
            value={content.ctaButtonLabel}
            onChange={(e) => update({ ctaButtonLabel: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>
    </div>
  );
}

function AboutEditorForm({ content, onChange }: { content: AboutContent; onChange: (c: AboutContent) => void }) {
  const update = (partial: Partial<AboutContent>) => onChange({ ...content, ...partial });
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(["hero", "whoWeAre", "values", "cta"].map((id) => [id, true]))
  );
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-2">
      <CollapsibleSection id="hero" title="Hero" open={open.hero ?? true} onToggle={() => toggle("hero")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Title</span>
          <input
            type="text"
            value={content.heroTitle}
            onChange={(e) => update({ heroTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.heroSubline}
            onChange={(e) => update({ heroSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection id="whoWeAre" title="Who We Are" open={open.whoWeAre ?? true} onToggle={() => toggle("whoWeAre")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Section title</span>
          <input
            type="text"
            value={content.whoWeAreTitle}
            onChange={(e) => update({ whoWeAreTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Paragraphs (one per line)</span>
          <textarea
            value={content.whoWeAreParagraphs.join("\n\n")}
            onChange={(e) => update({ whoWeAreParagraphs: e.target.value.split(/\n\n+/).filter(Boolean) })}
            rows={5}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection id="values" title="Values" open={open.values ?? true} onToggle={() => toggle("values")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Section title</span>
          <input
            type="text"
            value={content.valuesTitle}
            onChange={(e) => update({ valuesTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        {content.values.map((v, i) => (
          <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <input
              type="text"
              value={v.title}
              onChange={(e) => {
                const next = [...content.values];
                next[i] = { ...next[i], title: e.target.value };
                update({ values: next });
              }}
              placeholder="Value title"
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <textarea
              value={v.description}
              onChange={(e) => {
                const next = [...content.values];
                next[i] = { ...next[i], description: e.target.value };
                update({ values: next });
              }}
              placeholder="Description"
              rows={2}
              className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection id="cta" title="CTA" open={open.cta ?? true} onToggle={() => toggle("cta")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Title</span>
          <input
            type="text"
            value={content.ctaTitle}
            onChange={(e) => update({ ctaTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.ctaSubline}
            onChange={(e) => update({ ctaSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Phone (for CTA button)</span>
          <input
            type="text"
            value={content.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>
    </div>
  );
}

function ContactEditorForm({ content, onChange }: { content: ContactContent; onChange: (c: ContactContent) => void }) {
  const update = (partial: Partial<ContactContent>) => onChange({ ...content, ...partial });
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(["hero", "getInTouch", "contactBusiness"].map((id) => [id, true]))
  );
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-2">
      <CollapsibleSection id="hero" title="Hero" open={open.hero ?? true} onToggle={() => toggle("hero")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Title</span>
          <input
            type="text"
            value={content.heroTitle}
            onChange={(e) => update({ heroTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subline</span>
          <input
            type="text"
            value={content.heroSubline}
            onChange={(e) => update({ heroSubline: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection id="getInTouch" title="Get in touch" open={open.getInTouch ?? true} onToggle={() => toggle("getInTouch")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Title</span>
          <input
            type="text"
            value={content.getInTouchTitle}
            onChange={(e) => update({ getInTouchTitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Subtitle</span>
          <input
            type="text"
            value={content.getInTouchSubtitle}
            onChange={(e) => update({ getInTouchSubtitle: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Intro paragraph</span>
          <textarea
            value={content.introParagraph}
            onChange={(e) => update({ introParagraph: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection id="contactBusiness" title="Contact & business" open={open.contactBusiness ?? true} onToggle={() => toggle("contactBusiness")}>
        <label className="block">
          <span className="text-sm text-neutral-600">Phone</span>
          <input
            type="text"
            value={content.phone}
            onChange={(e) => update({ phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Email</span>
          <input
            type="email"
            value={content.email}
            onChange={(e) => update({ email: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">ABN</span>
          <input
            type="text"
            value={content.abn}
            onChange={(e) => update({ abn: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Licence number</span>
          <input
            type="text"
            value={content.licenceNo}
            onChange={(e) => update({ licenceNo: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Service area</span>
          <input
            type="text"
            value={content.serviceArea}
            onChange={(e) => update({ serviceArea: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">Hours</span>
          <input
            type="text"
            value={content.hours}
            onChange={(e) => update({ hours: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </label>
      </CollapsibleSection>
    </div>
  );
}
