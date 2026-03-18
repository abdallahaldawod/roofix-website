# Plan: Stage 2 – Manual Connect Source Flow (Visible Browser)

## Overview

Implement a manual Connect Source flow for external lead sources only: launch a visible Playwright browser, open the source’s Login URL, let the user log in manually, detect success when the browser reaches the configured Leads URL, save the authenticated session (storage state), update source auth metadata, and close the browser. No background scanning, no lead extraction, no auto-login. Roofix Website (system source) is unchanged.

## 1. Source metadata (types + persistence)

**File: [lib/leads/types.ts](lib/leads/types.ts)**

- Add `LeadSourceAuthStatus = "not_connected" | "connecting" | "connected" | "failed" | "needs_reconnect"`.
- On `LeadSource` add:
  - `lastAuthAt?: FsTimestamp | null`
  - `lastAuthError?: string | null`
- Keep `authStatus` as `string` (or type as `LeadSourceAuthStatus`) and `storageStatePath` as-is.

**Files: [lib/leads/sources.ts](lib/leads/sources.ts), [lib/leads/sources-admin.ts](lib/leads/sources-admin.ts)**

- In `toLeadSource`, map `lastAuthAt` and `lastAuthError` (default `null`/`undefined`).
- Add **server-only** `updateSourceAuthAdmin(sourceId, { authStatus?, lastAuthAt?, lastAuthError?, storageStatePath? })` in `sources-admin.ts` to update only auth-related fields via Admin SDK.

## 2. Playwright connection helper (generic, source-agnostic)

**New: `lib/leads/connection/playwright-connection.ts`** (or under `lib/leads/connection/`)

- **`runManualConnection(options)`**:
  - `loginUrl: string`, `leadsUrl: string`, `storageStatePath: string`, `timeoutMs?: number` (e.g. 5 min default).
- Launch Chromium with `headless: false`.
- Create context and page, then `page.goto(loginUrl)`.
- Wait until the current page URL “reaches” the Leads URL:
  - Consider “reached” if the current URL equals or is a subpath of `leadsUrl` (normalize both, compare origin + pathname prefix).
- On success: `context.storageState({ path: storageStatePath })`, close browser, return `{ ok: true }`.
- On timeout: close browser, return `{ ok: false, error: "Connection timed out. Please try again." }`.
- If browser/context/page is closed by user before reaching Leads URL: catch, return `{ ok: false, error: "Browser was closed before reaching the leads page." }`.
- No platform-specific selectors or logic (no hipages-specific code).

**URL matching:** Normalize `leadsUrl` and current URL (origin + pathname); treat “reached” when current URL’s origin matches and pathname is equal or starts with leads pathname (with a trailing slash check). Handle both with and without trailing slashes.

## 3. Connection service (orchestration)

**New: `lib/leads/connection/connect-source.ts`** (server-only)

- **`connectSource(sourceId: string)`**: `Promise<{ ok: true } | { ok: false; error: string }>`.
- Load source with `getSourceByIdAdmin(sourceId)`.
- Validate: source exists, `!source.isSystem`, `source.loginUrl` and `source.leadsUrl` are non-empty.
- Set auth state to “connecting”: `updateSourceAuthAdmin(sourceId, { authStatus: "connecting" })`.
- Resolve storage state path: e.g. `.auth/sources/<sourceId>/storage-state.json`; ensure directory exists (`mkdirSync` recursive).
- Call `runManualConnection(loginUrl, leadsUrl, storageStatePath, { timeoutMs })`.
- **On success:**  
  `updateSourceAuthAdmin(sourceId, { authStatus: "connected", lastAuthAt: serverTimestamp(), lastAuthError: null, storageStatePath })`.  
  Use a path format that the future scan runner can use (relative to project root or absolute; same as existing script convention).
- **On failure:**  
  `updateSourceAuthAdmin(sourceId, { authStatus: "failed", lastAuthError: errorMessage })`.  
  Do not set `lastAuthAt` or clear `storageStatePath` on failure (optional: leave old path for “reconnect” context).
- Return `{ ok: true }` or `{ ok: false, error }`.

## 4. API route (trigger from UI)

**New: `app/api/control-centre/leads/connect-source/route.ts`**

- **POST** only. Body: `{ sourceId: string }`.
- Use `requireControlCentreAuth(request)` (same pattern as other control-centre APIs).
- Call `connectSource(sourceId)`.
- Return JSON: `{ ok: true }` or `{ ok: false, error: string }` with appropriate status codes (e.g. 400 for validation, 200/500 for result).

## 5. UI: Connect / Reconnect and auth status

**SourcesTable**

- For each **external** source (not system):
  - Show an **auth status** badge: `not_connected` | `connecting` | `connected` | `failed` | `needs_reconnect` (e.g. “Not connected”, “Connecting…”, “Connected”, “Failed”, “Needs reconnect”).
  - Show **Connect Source** when `authStatus` is not `connected` (or empty/not_connected/failed/needs_reconnect).
  - Show **Reconnect** when `authStatus === "connected"` or `failed` or `needs_reconnect`.
  - Optionally show `lastAuthAt` (formatted) and `lastAuthError` (e.g. tooltip or secondary line) when present.
- Do not show Connect/Reconnect for system sources.

**SourcesTab**

- Add `connectingSourceId: string | null` state (or a Set) to track which source is currently connecting.
- Add `handleConnect(sourceId)` that:
  - Sets connecting state for that source.
  - Calls `POST /api/control-centre/leads/connect-source` with `{ sourceId }`.
  - On response, clears connecting state and calls `load()` to refresh sources.
  - Optionally show a toast or inline error if `ok: false`.
- Pass `onConnect`, `connectingSourceId` (or similar) to `SourcesTable`.

**Badge**

- Add an **AuthStatusBadge** component (or extend Badge) for the auth status values above; keep styles minimal and consistent with existing Status/Mode badges.

## 6. Architecture summary

- **Playwright helper** (`playwright-connection.ts`): only browser launch, navigation, URL wait, storage state save; no Firestore, no source concept.
- **Connection service** (`connect-source.ts`): load source, validate, set connecting, call Playwright helper, update Firestore auth fields via `updateSourceAuthAdmin`.
- **API route**: auth check, call connection service, return result.
- **UI**: table shows auth badge + Connect/Reconnect; tab handles fetch and refresh. No scanning or lead import logic.

## 7. Out of scope (explicitly not in this task)

- Background/headless scanning.
- Lead extraction or import.
- Auto-login or platform-specific selectors.
- Changes to Roofix Website or system source behavior.
- Implementing the scan runner that reuses the session (Stage 4); only ensure storage state path and format are the same as already used by existing scripts so it can be reused later.

## 8. Implementation order

1. Types + mappers + `updateSourceAuthAdmin`.
2. Playwright connection helper (URL matching, timeout, storage state save).
3. Connection service `connectSource`.
4. API route POST connect-source.
5. UI: AuthStatusBadge, SourcesTable (auth column + Connect/Reconnect), SourcesTab (handleConnect, loading state).
