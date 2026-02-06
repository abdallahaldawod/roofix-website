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
    <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CARD_CONFIG.map((card) => {
        const href = base ? base + card.path : card.path;
        return (
          <Link
            key={card.path}
            href={href}
            className="flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md active:bg-neutral-50 sm:min-h-0 sm:p-6"
          >
            <card.icon className="h-9 w-9 text-accent sm:h-10 sm:w-10" />
            <h2 className="mt-2 font-semibold text-neutral-900 sm:mt-3">{card.label}</h2>
            <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{card.description}</p>
            {card.label === "Services" && servicesTitles.length > 0 && (
              <p className="mt-2 line-clamp-2 border-t border-neutral-100 pt-2 text-xs font-medium text-neutral-500 sm:mt-3 sm:pt-3">
                On website: {servicesTitles.join(", ")}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
