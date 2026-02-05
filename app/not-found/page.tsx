import NotFound from "../not-found";

/**
 * Route at /not-found so middleware can rewrite blocked /control-centre
 * requests here to show the standard 404 page (no redirect, hidden).
 */
export default function NotFoundRoute() {
  return <NotFound />;
}
