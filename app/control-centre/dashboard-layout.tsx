"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useControlCentreBase } from "./use-base-path";
import {
  LayoutDashboard,
  FolderOpen,
  Wrench,
  MessageSquare,
  BarChart3,
  LogOut,
} from "lucide-react";

const nav = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/projects", label: "Projects", icon: FolderOpen },
  { path: "/services", label: "Services", icon: Wrench },
  { path: "/testimonials", label: "Testimonials", icon: MessageSquare },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
];

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = useControlCentreBase();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function href(path: string) {
    return path === "/" ? (base || "/") : (base + path);
  }

  const handleSignOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
    router.replace(href("/login"));
  }, [base, router]);

  useEffect(() => {
    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        handleSignOut();
      }, INACTIVITY_MS);
    };

    resetTimer();
    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleSignOut]);

  const isDashboard = pathname === "/control-centre" || pathname === "/";

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-4">
          <span className="font-semibold text-neutral-900">Control Centre</span>
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {nav.map((item) => {
            const itemHref = href(item.path);
            const active = item.path === "/" ? isDashboard : (pathname === "/control-centre" + item.path || pathname === item.path);
            return (
              <Link
                key={item.path}
                href={itemHref}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-accent text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-neutral-200 bg-white p-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Log out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
