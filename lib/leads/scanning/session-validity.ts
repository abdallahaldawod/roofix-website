/**
 * Session validity check for background scan: determine if the current page URL
 * still "reaches" the configured Leads URL (same origin + pathname match or subpath).
 * Used to detect redirects to login after loading the saved session.
 * Source-agnostic; no Playwright imports.
 */

function normalizePathname(pathname: string): string {
  const p = pathname || "/";
  return p === "/" ? "/" : p.replace(/\/+$/, "") || "/";
}

/**
 * Returns true when the current URL has "reached" the leads URL:
 * same origin and pathname equals or is a subpath of the leads pathname.
 * Use after navigating to leadsUrl with a saved session; if false, the session
 * likely expired and the user was redirected to login.
 */
export function urlReachesLeads(currentUrl: string, leadsUrl: string): boolean {
  let current: URL;
  let target: URL;
  try {
    current = new URL(currentUrl);
  } catch {
    return false;
  }
  try {
    target = new URL(leadsUrl);
  } catch {
    return false;
  }
  if (current.origin !== target.origin) return false;
  const currentPath = normalizePathname(current.pathname);
  const targetPath = normalizePathname(target.pathname);
  if (currentPath === targetPath) return true;
  if (targetPath === "/") return true;
  return currentPath.startsWith(targetPath + "/");
}
