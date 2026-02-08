"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  FileText,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const nav = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/site-pages", label: "Pages", icon: FileText },
  { path: "/projects", label: "Projects", icon: FolderOpen },
  { path: "/services", label: "Services", icon: Wrench },
  { path: "/testimonials", label: "Testimonials", icon: MessageSquare },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isDashboard = pathname === "/control-centre" || pathname === "/";

  const navContent = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 md:border-b">
        <span className="font-semibold text-neutral-900">Control Centre</span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-auto p-2">
        {nav.map((item) => {
          const itemHref = href(item.path);
          const active = item.path === "/" ? isDashboard : (pathname === "/control-centre" + item.path || pathname === item.path);
          return (
            <Link
              key={item.path}
              href={itemHref}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
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
          onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 min-h-[44px]"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* Mobile menu overlay */}
      <div
        role="presentation"
        aria-hidden={!mobileMenuOpen}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden ${mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      {/* Sidebar: drawer on mobile, fixed on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:w-56 md:max-w-none md:translate-x-0 md:shadow-none ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </aside>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="font-semibold text-neutral-900">Control Centre</span>
      </div>
      {/* Main content: add top padding on mobile for fixed header */}
      <main className="min-w-0 flex-1 p-4 pt-[4.5rem] md:pt-8 md:p-8">{children}</main>
    </div>
  );
}
