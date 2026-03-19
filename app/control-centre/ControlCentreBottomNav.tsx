"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, BarChart3, MoreHorizontal } from "lucide-react";
import { useControlCentreBase } from "./use-base-path";

const TABS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/leads", label: "Leads", icon: Users },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/more", label: "More", icon: MoreHorizontal },
] as const;

type Props = { onMoreClick: () => void };

export function ControlCentreBottomNav({ onMoreClick }: Props) {
  const pathname = usePathname();
  const base = useControlCentreBase();
  const linkBase = base || "/control-centre";

  function href(path: string) {
    if (path === "/more") return "#";
    return path === "/" ? (linkBase === "/control-centre" ? "/control-centre" : "/") : linkBase + path;
  }

  const isDashboard = pathname === "/control-centre" || pathname === "/";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 bg-white md:hidden safe-bottom"
      aria-label="Primary navigation"
    >
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom,0)] pt-2">
        {TABS.map((tab) => {
          if (tab.path === "/more") {
            return (
              <button
                key="more"
                type="button"
                onClick={onMoreClick}
                className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 text-neutral-600"
                aria-label="More sections"
              >
                <tab.icon className="h-6 w-6" aria-hidden />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          }
          const to = href(tab.path);
          const active =
            tab.path === "/"
              ? isDashboard
              : pathname === linkBase + tab.path || pathname === "/control-centre" + tab.path || pathname === tab.path;
          return (
            <Link
              key={tab.path}
              href={to}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 ${
                active ? "text-neutral-900" : "text-neutral-600"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <tab.icon className="h-6 w-6" aria-hidden />
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
