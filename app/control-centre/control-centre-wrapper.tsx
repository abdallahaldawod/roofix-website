"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "./auth-guard";
import DashboardLayout from "./dashboard-layout";

const LOGIN_PATH = "/control-centre/login";
const LOGIN_PATH_CLEAN = "/login"; // admin host clean URL

export function ControlCentreWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === LOGIN_PATH || pathname === LOGIN_PATH_CLEAN;

  return (
    <AuthGuard>
      {isLogin ? children : <DashboardLayout>{children}</DashboardLayout>}
    </AuthGuard>
  );
}
