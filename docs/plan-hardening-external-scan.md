# Hardening pass: External source scanning (reliability, diagnostics, safer ops)

## Goals

- Improve retry and timeout handling (connection, scan startup, navigation, extraction).
- Improve reconnect/session-expiry handling and avoid ambiguous states.
- Add structured logging for key stages.
- Add extraction debugging support (page URL, title, card count, optional snippets).
- Introduce scan run history (per-run records with status and counts).
- Improve failure isolation (per lead, per step, per run).
- Improve operational UI (errors, reconnect reasons, recent scan history).
- Optional debug mode for extraction troubleshooting.
- Keep architecture clean and source-agnostic.

---

## 1. Retry and timeout handling

### 1.1 New module: `lib/leads/scanning/retry-timeout.ts`

- **`withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T>`**  
  Wraps a promise; rejects with a clear error if it exceeds `ms`. Used for navigation, extraction, browser launch.

- **`retryWithBackoff<T>(fn: () => Promise<T>, options: { maxAttempts: number; timeoutMs?: number; label: string }): Promise<T>`**  
  Runs `fn` up to `maxAttempts` (e.g. 2). No infinite retries. Optional per-attempt timeout. On final failure, throw with last error.

### 1.2 Usage

- **Background scan runner**
  - Browser launch: wrap in `withTimeout(..., LAUNCH_TIMEOUT_MS, "browser_launch")`.
  - Navigation: keep existing `NAVIGATION_TIMEOUT_MS`; on timeout, treat as failure and set a clear error (e.g. "Navigation timed out; session may have expired" and consider `needs_reconnect` when the error suggests login redirect or timeout).
  - Extraction: wrap `extractLeadsFromPage` in `withTimeout(..., EXTRACTION_TIMEOUT_MS, "extraction")`.
  - No retries for the full scan; optional single retry only for `page.goto` (e.g. retry once on timeout).

- **Connect flow**
  - Already has 5 min for "reach leads" and 15s for login page. Add explicit timeout around the whole `runManualConnection` if needed (e.g. 6 min cap).

---

## 2. Reconnect / session-expiry handling

- **Session validity**
  - Keep `urlReachesLeads(currentUrl, leadsUrl)` as the main signal for "still on leads page".
  - When `page.goto` throws (timeout, net error, etc.): in the catch block, update source with `lastScanStatus: "failed"`, `lastScanError: <message>`. If the error message indicates timeout or load failure, append a hint: "If this persists, try Reconnect."
  - When `urlReachesLeads` is false after load: already marking `needs_reconnect`. No change.
  - When we fail before we could load the page (e.g. browser launch fails): do **not** set `needs_reconnect`; set only `lastScanStatus: "failed"` and `lastScanError`. Reconnect is only for session/redirect issues.

- **Ambiguous states**
  - Always set both `lastScanStatus` and `lastScanError` on failure so the UI never shows "success" with an error.
  - When marking `needs_reconnect`, always set `lastScanError` to a user-facing message (e.g. "Session expired or redirected to login.").

---

## 3. Structured logging

### 3.1 New module: `lib/leads/scanning/scan-logger.ts`

- **`logScan(stage: string, data: Record<string, unknown>): void`**  
  Logs a single line, e.g. `[scan] stage=<stage> sourceId=... ...` with key=value or JSON for complex values. Use for:
  - scan_start, session_loaded, navigation_start, navigation_done, session_valid, session_expired
  - extraction_start, extraction_done (selector, cardsFound, extracted, failed)
  - import_done (imported, duplicate, failedImport)
  - scan_done, scan_failed

- Log levels: use a single `logScan` that prints to console; no log level filter (keep it simple). Avoid noisy repeated logs (e.g. one log per lead).

### 3.2 Where to log

- **background-scan-runner.ts**: at start (sourceId, leadsUrl), after resolving session path, after navigation (currentUrl, sessionValid), before/after extraction, after import loop (counts), on failure (error).
- **selector-extractor.ts**: already has one log; replace with `logScan("extraction_done", { selector, cardsFound, extracted, failed })`. Optionally `extraction_start` with selector.

---

## 4. Extraction debugging support

### 4.1 Types (`lib/leads/types.ts`)

- **`LastScanDebug`** (optional on source or on scan run):
  - `pageUrl?: string`
  - `pageTitle?: string`
  - `leadCardCount?: number`
  - `snippet?: string` (max length in code, e.g. 2000 chars, for first card HTML or summary)
  - `capturedAt?: FsTimestamp` (or use scan run’s finishedAt)

### 4.2 When to capture

- When extraction runs (with or without extraction config): after `page.goto` and before extraction, capture `page.url()`, `page.title()`, and if extraction runs, `leadCardCount` from selector.
- If `extractionDebug === true` on source (new optional field): also capture a truncated snippet (e.g. first card’s `outerHTML` or text summary, max 1500 chars). Store in scan run and optionally on source’s `lastScanDebug`.

### 4.3 Where to store

- **On LeadSource**: optional `lastScanDebug?: LastScanDebug` (so UI can show "last run" debug without reading scan_runs).
- **On each ScanRun document**: `debug?: LastScanDebug` (so history has per-run debug).

---

## 5. Scan run record / history

### 5.1 New collection: `scan_runs`

- Document shape:
  - `sourceId: string`
  - `startedAt: FsTimestamp`
  - `finishedAt: FsTimestamp`
  - `status: "success" | "failed" | "needs_reconnect"`
  - `extracted?: number`
  - `duplicate?: number`
  - `imported?: number`
  - `failedExtraction?: number`
  - `failedImport?: number`
  - `errorMessage?: string` (truncated, e.g. 500 chars)
  - `debug?: LastScanDebug`

### 5.2 New module: `lib/leads/scan-runs-admin.ts` (server-only)

- **`writeScanRunAdmin(data: ScanRunCreate): Promise<string | null>`** – add document, return id.
- **`getRecentScanRunsAdmin(sourceId: string, limit?: number): Promise<ScanRun[]>`** – query by sourceId, order by startedAt desc, limit (default 10).

### 5.3 When to write

- At the end of `runBackgroundScan` (success or failure): build a ScanRun from the run’s counts and status, set `finishedAt` to now, then call `writeScanRunAdmin`. On failure, set `errorMessage` from the caught error (truncated).

### 5.4 UI

- Source details drawer: add section "Recent scans" that fetches via an API that calls `getRecentScanRunsAdmin` and returns last 5–10 runs. Show startedAt, status, counts, error if any. Optional link to "View all" if we add a small history page later.

---

## 6. Failure isolation

- **Per lead**: already isolated in selector-extractor (try/catch per card) and in runner (try/catch per import). Keep as is.
- **Per extraction step**: if `extractLeadsFromPage` throws (e.g. timeout), runner catches it, closes browser, updates source and writes a scan run with status failed. Do not update partial counts on the source for that run; set only lastScanStatus and lastScanError (and optionally lastScanDebug from what we captured before the throw).
- **Per scan run**: every run writes one scan run document; partial state is reflected in that document (e.g. extracted but failedImport count) and in source’s lastScan* only when we complete the run without throwing.
- **Auth state**: when we mark needs_reconnect, we only do it when we determined the session is invalid (redirected to login), not on generic timeouts (unless we decide timeouts on navigation are always treated as possible session expiry; plan: treat navigation timeout as "failed" with hint to reconnect, not automatically needs_reconnect).

---

## 7. Operational UI diagnostics

- **Source table / drawer**
  - Show last scan error in full (already in drawer). Ensure table tooltip or drawer shows `lastScanError` when status is failed or needs_reconnect.
  - When `lastScanDebug` is present: in drawer, show "Last run: page URL, page title, card count" and optionally "Snippet" (collapsible or truncated).
- **Reconnect reason**
  - When status is needs_reconnect, show `lastScanError` as the reconnect reason (e.g. "Session expired or redirected to login.").
- **Recent scan history**
  - In source details drawer, add "Recent scans" list from scan_runs API (last 5–10). Each row: date/time, status badge, counts (extracted, imported, duplicate, failed), error if any.

---

## 8. Safe debug mode for extraction

- Add optional **`extractionDebug?: boolean`** on LeadSource (or under extractionConfig). When true:
  - In selector-extractor or runner, after getting cards, capture first card’s outerHTML (or innerText) truncated to 1500 chars.
  - Store in `LastScanDebug.snippet` and persist to scan run and optionally to source’s lastScanDebug.
- No change to read-only behavior; only adds capture and storage.

---

## 9. Architecture

- **New/updated files**
  - `lib/leads/scanning/retry-timeout.ts` – timeouts and limited retry.
  - `lib/leads/scanning/scan-logger.ts` – structured log helper.
  - `lib/leads/scan-runs-admin.ts` – write/read scan runs.
  - `lib/leads/types.ts` – LastScanDebug, ScanRun, ScanRunCreate.
  - Extend `lead_sources`: optional `lastScanDebug`, optional `extractionDebug`.
  - `lib/leads/scanning/selector-extractor.ts` – return debug info (pageUrl, pageTitle, cardCount); optional snippet when requested.
  - `lib/leads/scanning/background-scan-runner.ts` – use timeouts, logger, write scan run, capture and persist debug, distinguish failure vs needs_reconnect.
- **API**
  - New route: `GET /api/control-centre/leads/scan-runs?sourceId=...` – returns recent scan runs for a source (server-only auth).
- **UI**
  - Source details drawer: show lastScanDebug when present; add "Recent scans" from API.
  - Optional: Add extractionDebug checkbox in AddSourceModal (extraction section) and show in drawer.

---

## 10. Implementation order

1. Types: LastScanDebug, ScanRun, ScanRunCreate; extractionDebug on LeadSource.
2. retry-timeout.ts and scan-logger.ts.
3. scan-runs-admin.ts and Firestore collection.
4. selector-extractor: return debug (pageUrl, pageTitle, cardCount, optional snippet); use timeout around extraction.
5. background-scan-runner: use timeouts for launch and extraction; use logger; capture debug; write scan run on exit; treat navigation timeout as failed with hint (no auto needs_reconnect).
6. sources-admin + types: add lastScanDebug and extractionDebug to source (mapper + update).
7. API route for recent scan runs.
8. UI: drawer shows lastScanDebug and Recent scans; optional extractionDebug in modal and drawer.

---

## Out of scope

- Source-side lead actions (read-only only).
- Redesign of core scanner architecture.
- Changing rule engine or dedupe logic.
