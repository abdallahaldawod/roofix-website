import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.roofix.com.au").toLowerCase();
const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

function getHostname(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.hostname;
  const first = raw.split(",")[0].trim();
  return first.split(":")[0].trim().toLowerCase();
}

function withNoindex(res: NextResponse): NextResponse {
  Object.entries(NOINDEX_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const pathname = request.nextUrl.pathname;

  const isAdminHost =
    hostname === ADMIN_HOST || hostname.endsWith("." + ADMIN_HOST);
  const isLocalhost =
    hostname === "localhost" || hostname === "127.0.0.1";
  const allowedControlCentre = isAdminHost || isLocalhost;

  const controlCentreRequestHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-is-control-centre", "1");
    return h;
  };

  // Main site (not admin, not localhost): /control-centre or /control-centre/* → real 404 (no redirect)
  if (
    pathname === "/control-centre" ||
    pathname.startsWith("/control-centre/")
  ) {
    if (!allowedControlCentre) {
      return NextResponse.rewrite(new URL("/not-found", request.url));
    }
    const url = new URL(pathname + request.nextUrl.search, request.url);
    const res = NextResponse.rewrite(url, {
      request: { headers: controlCentreRequestHeaders() },
    });
    return withNoindex(res);
  }

  // Admin host only: clean URL rewrites (/, /login, /projects, etc. → /control-centre/...)
  if (isAdminHost) {
    if (pathname === "/" || pathname === "") {
      const res = NextResponse.rewrite(new URL("/control-centre", request.url), {
        request: { headers: controlCentreRequestHeaders() },
      });
      return withNoindex(res);
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
      const res = NextResponse.rewrite(new URL(controlPath, request.url), {
        request: { headers: controlCentreRequestHeaders() },
      });
      return withNoindex(res);
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
