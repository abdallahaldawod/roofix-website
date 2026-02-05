"use client";

import Link from "next/link";
import { FolderOpen, Wrench, MessageSquare } from "lucide-react";
import { useControlCentreBase } from "./use-base-path";

const CARD_CONFIG = [
  { path: "/projects", label: "Projects", icon: FolderOpen, description: "Manage project gallery (title, suburb, description, tags, images)." },
  { path: "/services", label: "Services", icon: Wrench, description: "Manage services (slug, title, description, content)." },
  { path: "/testimonials", label: "Testimonials", icon: MessageSquare, description: "Manage customer testimonials." },
] as const;

type Props = {
  servicesTitles: string[];
};

export function DashboardCards({ servicesTitles }: Props) {
  const base = useControlCentreBase();

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CARD_CONFIG.map((card) => {
        const href = base ? base + card.path : card.path;
        return (
          <Link
            key={card.path}
            href={href}
            className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <card.icon className="h-10 w-10 text-accent" />
            <h2 className="mt-3 font-semibold text-neutral-900">{card.label}</h2>
            <p className="mt-1 text-sm text-neutral-600">{card.description}</p>
            {card.label === "Services" && servicesTitles.length > 0 && (
              <p className="mt-3 border-t border-neutral-100 pt-3 text-xs font-medium text-neutral-500">
                On website: {servicesTitles.join(", ")}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
