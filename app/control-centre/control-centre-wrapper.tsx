"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "./auth-guard";
import DashboardLayout from "./dashboard-layout";

const LOGIN_PATH = "/control-centre/login";

export function ControlCentreWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === LOGIN_PATH;

  return (
    <AuthGuard>
      {isLogin ? children : <DashboardLayout>{children}</DashboardLayout>}
    </AuthGuard>
  );
}
