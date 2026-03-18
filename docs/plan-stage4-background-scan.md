# Plan: Stage 4 – Background Scan Runner (Session Validation)

## Overview

Implement a headless background scan for connected external sources that reuses the saved session, opens the Leads URL silently, and verifies the source is still logged in. No lead extraction, no source-specific selectors, no lead actions. This stage only validates that the saved session can reach the Leads URL; if redirected to login, mark source as needs_reconnect.

## 1. Source scan metadata (types + persistence)

- **LeadSource**: Add `lastScanStatus?: string` (e.g. `"idle"` | `"success"` | `"failed"` | `"needs_reconnect"`), `lastScanError?: string | null`.
- **Mappers**: Map `lastScanStatus`, `lastScanError` in `sources.ts` and `sources-admin.ts` (defaults: undefined / null).
- **sources-admin**: Add `updateSourceScanResultAdmin(sourceId, { lastScanAt?, lastScanStatus?, lastScanError? })` to update only scan-result fields. Use for recording outcome of background scan.

## 2. Shared URL/session-validity helper

- **New: `lib/leads/scanning/session-validity.ts`** (or under `lib/leads/connection/`):
  - Export a function that, given a current URL (string or URL) and the configured Leads URL (string), returns whether the current URL "reaches" the leads URL (same origin, pathname equal or subpath). Reuse the same logic as in playwright-connection (normalize pathname, compare). This keeps session-validity check generic and reusable.
  - Optionally accept a Playwright Page and leadsUrl, return boolean (so the runner can pass page.url() and leadsUrl).

## 3. Saved-session loading

- Use existing **`resolveStorageStatePath(relativePath)`** from `session-persistence.ts` to get the absolute path for the source’s `storageStatePath`. No new module; the background runner will call this when the source has `storageStatePath` and `leadsUrl`.

## 4. Background scan runner (new service)

- **New: `lib/leads/scanning/background-scan-runner.ts`** (server-only):
  - **`runBackgroundScan(sourceId: string)`**: `Promise<RunBackgroundScanResult>`.
  - Load source via `getSourceByIdAdmin(sourceId)`.
  - Validate: source exists, not system, has `storageStatePath` and `leadsUrl`.
  - Resolve storage state path with `resolveStorageStatePath(source.storageStatePath)`.
  - Launch Chromium **headless: true**, create context with `storageState: absolutePath`, create page.
  - `page.goto(leadsUrl, { waitUntil: "domcontentloaded", timeout })`.
  - Get `page.url()`, call session-validity helper: stillReachesLeads(currentUrl, leadsUrl).
  - **If still valid:** Close browser. Call `updateSourceScanResultAdmin(sourceId, { lastScanAt: now, lastScanStatus: "success", lastScanError: null })`. Return `{ ok: true }`.
  - **If not valid (redirected to login):** Close browser. Call `updateSourceAuthAdmin(sourceId, { authStatus: "needs_reconnect", lastAuthError: "Session expired or redirected to login." })` and `updateSourceScanResultAdmin(sourceId, { lastScanAt: now, lastScanStatus: "needs_reconnect", lastScanError: "Session expired or redirected to login." })`. Return `{ ok: false, error: "...", needsReconnect: true }`.
  - On navigation/launch errors: Close browser, update lastScanStatus/lastScanError, optionally set needs_reconnect if it’s a session-related failure. Return `{ ok: false, error }`.
  - No adapters, no lead extraction, no selectors.

## 5. API route (Scan Now)

- **New: `app/api/control-centre/leads/scan/route.ts`**
  - **POST** with body `{ sourceId: string }`.
  - Use `requireControlCentreAuth(request)`.
  - Call `runBackgroundScan(sourceId)`.
  - Return `{ ok: true }` or `{ ok: false, error: string, needsReconnect?: boolean }` with appropriate status codes.

## 6. UI updates

- **SourcesTab**: Add `scanningSourceId`, `handleScanNow(sourceId)` that POSTs to `/api/control-centre/leads/scan`, then `load()`. Show scan error if any.
- **SourcesTable**: For external sources with `authStatus === "connected"`, add a **Scan Now** button. Disable when `scanningSourceId === source.id` and show "Scanning…". Pass `onScanNow`, `scanningSourceId`. Optionally show `lastScanStatus` / `lastScanError` near Last Scan (e.g. small badge or text: success / failed / needs reconnect).
- Keep **Run test** (FlaskConical) as-is for the existing mock/test flow; **Scan Now** is the new background session-validation scan.

## 7. Architecture summary

- **Session-validity**: Shared helper (URL reach check) used by background runner.
- **Session loading**: Existing `resolveStorageStatePath`; no new helper.
- **Background scan runner**: Single entry `runBackgroundScan(sourceId)`; headless browser, load state, goto leadsUrl, check validity, update scan + auth metadata.
- **Scan metadata**: `updateSourceScanResultAdmin` only updates lastScanAt, lastScanStatus, lastScanError.
- **API**: POST scan route calls runner, returns result.
- **UI**: Scan Now button + scanning state + optional lastScanStatus/lastScanError display.

## 8. Out of scope (Stage 4)

- Lead extraction, per-source selectors, lead actions.
- Scheduled/cron scanning (only manual "Scan Now" in this stage).
- Changing manual Connect or saved-session format.

## 9. Future (Stage 5)

- The same `runBackgroundScan` flow (or a slight extension) will load the Leads URL page; Stage 5 can plug extraction logic after the validity check passes, reusing the same headless context and page.
