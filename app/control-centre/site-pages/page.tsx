"use client";

import Link from "next/link";
import { FileText, ExternalLink, Home, Info, Mail, Wrench, FolderOpen, Pencil } from "lucide-react";
import { useControlCentreBase } from "../use-base-path";

const PUBLIC_SITE_ORIGIN =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://roofix.com.au";

const SITE_PAGES = [
  { path: "/home", pageId: "home" as const, label: "Home", description: "Main landing page", icon: Home, editable: true },
  { path: "/about", pageId: "about" as const, label: "About", description: "About Roofix and values", icon: Info, editable: true },
  { path: "/contact", pageId: "contact" as const, label: "Contact", description: "Contact form and business details", icon: Mail, editable: true },
  { path: "/services", pageId: null, label: "Services", description: "Service list (edit in Control Centre → Services)", icon: Wrench, editable: false },
  { path: "/projects", pageId: null, label: "Projects", description: "Project gallery (edit in Control Centre → Projects)", icon: FolderOpen, editable: false },
] as const;

export default function SitePagesPage() {
  const base = useControlCentreBase();
  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-neutral-600 sm:h-9 sm:w-9">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="truncate">Site pages</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          View and open the main pages on roofix.com.au. Edit Home, About and Contact with the live editor. Projects and Services are managed from the sidebar.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SITE_PAGES.map((page) => {
          const url = `${PUBLIC_SITE_ORIGIN}${page.path}`;
          const Icon = page.icon;
          const editHref = page.editable && page.pageId
            ? `${base || "/control-centre"}/site-pages/${page.pageId}/edit`
            : null;
          return (
            <div
              key={page.path}
              className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-neutral-900">{page.label}</h2>
                  <p className="mt-0.5 text-sm text-neutral-500">{page.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:border-neutral-300"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on site
                </a>
                {editHref && (
                  <Link
                    href={editHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-white px-3 py-2 text-sm font-medium text-accent shadow-sm transition-colors hover:bg-accent/10"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit with live editor
                  </Link>
                )}
                <span className="text-xs text-neutral-400">{page.path}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-neutral-500">
        Changes you make in the live editor are saved to the site and appear on the public pages. Projects, Services and Testimonials are managed from the Control Centre sidebar.
      </p>
    </div>
  );
}
