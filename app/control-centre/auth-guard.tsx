"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./use-auth";
import { useControlCentreBase } from "./use-base-path";

const LOGIN_PATH = "/control-centre/login";
const LOGIN_PATH_CLEAN = "/login"; // admin host clean URL (rewritten to /control-centre/login)

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const base = useControlCentreBase();
  const isLoginPage = pathname === LOGIN_PATH || pathname === LOGIN_PATH_CLEAN;

  const dashboardPath = base || "/";
  const loginPath = base ? `${base}/login` : "/login";

  useEffect(() => {
    if (status === "loading" || status === "unconfigured") return;
    if (isLoginPage) {
      if (status === "authenticated") {
        router.replace(dashboardPath);
      }
      return;
    }
    if (status === "unauthenticated") {
      router.replace(loginPath);
      return;
    }
    if (status === "forbidden") {
      const uid = user?.uid ? `&uid=${encodeURIComponent(user.uid)}` : "";
      router.replace(`${loginPath}?error=forbidden${uid}`);
      return;
    }
  }, [status, isLoginPage, router, user?.uid, dashboardPath, loginPath]);

  if (status === "unconfigured") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-amber-900">Firebase not configured</h1>
          <p className="mt-2 text-sm text-amber-800">
            Add <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_FIREBASE_API_KEY</code> and{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_FIREBASE_PROJECT_ID</code> to{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env.local</code> (see{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env.local.example</code>).
          </p>
          <p className="mt-3 text-xs text-amber-700">
            Restart the dev server after changing env vars.
          </p>
        </div>
        <a href="/home" className="mt-6 text-sm text-neutral-500 hover:text-neutral-700">← Back to site</a>
      </div>
    );
  }

  if (status === "loading" && !isLoginPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <p className="text-neutral-600">Checking access…</p>
      </div>
    );
  }

  if (isLoginPage && status !== "authenticated") {
    return <>{children}</>;
  }

  if (!isLoginPage && status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <p className="text-neutral-600">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
