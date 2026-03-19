"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { FolderOpen, Wrench, MessageSquare, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useControlCentreBase } from "./use-base-path";

const PROJECTS_COLLECTION = "projects";
const SERVICES_COLLECTION = "services";
const TESTIMONIALS_COLLECTION = "testimonials";

type StatCard = {
  label: string;
  value: number | null;
  href: string;
  icon: typeof FolderOpen;
  description: string;
};

export function DashboardOverview() {
  const base = useControlCentreBase();
  const [counts, setCounts] = useState<{
    projects: number | null;
    services: number | null;
    testimonials: number | null;
  }>({ projects: null, services: null, testimonials: null });

  useEffect(() => {
    let cancelled = false;
    const db = getFirestoreDb();

    Promise.all([
      getDocs(collection(db, PROJECTS_COLLECTION)),
      getDocs(collection(db, SERVICES_COLLECTION)),
      getDocs(collection(db, TESTIMONIALS_COLLECTION)),
    ])
      .then(([projectsSnap, servicesSnap, testimonialsSnap]) => {
        if (cancelled) return;
        setCounts({
          projects: projectsSnap.size,
          services: servicesSnap.size,
          testimonials: testimonialsSnap.size,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCounts({ projects: null, services: null, testimonials: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats: StatCard[] = [
    {
      label: "Projects",
      value: counts.projects,
      href: base + "/projects",
      icon: FolderOpen,
      description: "In gallery",
    },
    {
      label: "Services",
      value: counts.services,
      href: base + "/services",
      icon: Wrench,
      description: "Listed",
    },
    {
      label: "Testimonials",
      value: counts.testimonials,
      href: base + "/testimonials",
      icon: MessageSquare,
      description: "Published",
    },
    {
      label: "Analytics",
      value: null,
      href: base + "/analytics",
      icon: BarChart3,
      description: "View reports",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="flex min-h-[44px] items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <stat.icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums text-neutral-900">
              {stat.value !== null ? stat.value : "—"}
            </p>
            <p className="font-medium text-neutral-700">{stat.label}</p>
            <p className="text-sm text-neutral-500">{stat.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
