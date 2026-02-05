import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.roofix.com.au").toLowerCase();

function getHostname(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.hostname;
  const first = raw.split(",")[0].trim();
  return first.split(":")[0].trim().toLowerCase();
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const pathname = request.nextUrl.pathname;

  const isAdminHost =
    hostname === ADMIN_HOST || hostname.endsWith("." + ADMIN_HOST);
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1";
  const allowedControlCentre = isAdminHost || isLocalhost;

  // /control-centre or /control-centre/** on non-allowed host → 404 (hidden, no redirect)
  if (
    pathname === "/control-centre" ||
    pathname.startsWith("/control-centre/")
  ) {
    if (!allowedControlCentre) {
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
    return NextResponse.next();
  }

  // On admin host only: clean URL rewrites (/, /login, /projects, etc. → /control-centre/...)
  if (isAdminHost) {
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/control-centre", request.url));
    }
    if (
      pathname === "/login" ||
      pathname === "/projects" ||
      pathname === "/services" ||
      pathname === "/testimonials" ||
      pathname.startsWith("/projects/") ||
      pathname.startsWith("/services/")
    ) {
      const controlPath = "/control-centre" + pathname;
      return NextResponse.rewrite(new URL(controlPath, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/control-centre",
    "/control-centre/:path*",
    "/",
    "/login",
    "/projects",
    "/projects/:path*",
    "/services",
    "/services/:path*",
    "/testimonials",
  ],
};
