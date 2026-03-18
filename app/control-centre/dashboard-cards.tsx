"use client";

import Link from "next/link";
import { FileText, FolderOpen, Wrench, MessageSquare, BarChart3, Users, Settings } from "lucide-react";
import { useControlCentreBase } from "./use-base-path";

const CONTENT_CARDS = [
  {
    path: "/site-pages",
    label: "Pages",
    icon: FileText,
    description: "Edit Home, About and Contact with the live editor.",
  },
  {
    path: "/projects",
    label: "Projects",
    icon: FolderOpen,
    description: "Manage project gallery (title, suburb, description, tags, images).",
  },
  {
    path: "/services",
    label: "Services",
    icon: Wrench,
    description: "Manage services (slug, title, description, content).",
  },
  {
    path: "/testimonials",
    label: "Testimonials",
    icon: MessageSquare,
    description: "Manage customer testimonials and import Google reviews.",
  },
  {
    path: "/leads",
    label: "Leads",
    icon: Users,
    description: "View and manage your lead inbox.",
  },
  {
    path: "/leads/management",
    label: "Lead Management",
    icon: Settings,
    description: "Configure sources, rule sets, activity and settings.",
  },
] as const;

const INSIGHTS_CARDS = [
  {
    path: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "View traffic, conversions and real-time activity.",
  },
] as const;

export function DashboardCards() {
  const base = useControlCentreBase();

  return (
    <div className="mt-4 space-y-8">
      {/* Content section */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Content
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTENT_CARDS.map((card) => {
            const href = base ? base + card.path : card.path;
            return (
              <Link
                key={card.path}
                href={href}
                className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent transition-colors group-hover:bg-accent/25">
                  <card.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold text-neutral-900">{card.label}</h3>
                <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{card.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Insights section */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Insights
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INSIGHTS_CARDS.map((card) => {
            const href = base ? base + card.path : card.path;
            return (
              <Link
                key={card.path}
                href={href}
                className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent transition-colors group-hover:bg-accent/25">
                  <card.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold text-neutral-900">{card.label}</h3>
                <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{card.description}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
