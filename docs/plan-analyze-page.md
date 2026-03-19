# Analyze Page feature – plan

## Current state (unchanged)

- **Extraction**: `lib/leads/scanning/selector-extractor.ts` – `extractLeadsFromPage(page, config)` uses `SourceExtractionConfig` (leadCardSelector, titleSelector, descriptionSelector, suburb/postcode, externalId, detailLink, postedAt). Background scan uses this when `source.extractionConfig?.leadCardSelector` is set.
- **Session**: Connect flow saves storage state per source; `resolveStorageStatePath` + Chromium with `storageState` loads it. Same pattern used in background-scan-runner (headless goto leadsUrl).
- **Sources UI**: SourceDetailsDrawer – Connect, Scan Now, Edit. Shown when a source is selected; `canScan = authStatus === "connected" && !isSystem`.
- **Config persistence**: sources-admin reads `extractionConfig`; no dedicated update for extractionConfig yet. LeadSourceUpdate includes extractionConfig; we add an API route with Admin SDK for saving.

No changes to the existing scan/import pipeline; this feature is setup-only.

---

## 1. "Analyze Page" action and API

- **Where**: Source details drawer – add "Analyze Page" button next to Scan Now, only when connected (same as canScan). Disabled while analysis in progress.
- **API**: `POST /api/control-centre/leads/analyze-page` with body `{ sourceId: string }`. Auth: requireControlCentreAuth. Load source, validate connected + leadsUrl + storageStatePath, launch headless Chromium with storage state, goto leadsUrl, call analyzePageDom(page), run extraction preview (extractLeadsFromPage, slice to 5), close browser. Return `{ ok: true, diagnostics, suggestedConfig, previewLeads }` or `{ ok: false, error }`. Timeouts: e.g. 30s navigation, 60s analysis.

---

## 2. DOM analysis (new module)

- **New file**: `lib/leads/scanning/page-analyzer.ts` (server-only).
- **Input**: Playwright Page on leads list URL.
- **Steps**:
  1. **Candidate containers**: Repeated structures – `[data-testid]`, `[data-job-id]`, `article`, `li`, repeated divs with same class. Score by repetition, links inside, data attributes.
  2. **Chosen card**: Best candidate as leadCardSelector (2+ items, highest score).
  3. **Field inference** inside chosen container: title (h1–h4, first text, data-title), description (p, class*="description"), suburb/location (location-like text, class*="location"), postcode (4-digit, class*="postcode"), postedAt (date-like, class*="date"), externalId (data-id, data-job-id, or detail link href segment), detailLink (a[href*="/lead/"] or similar).
  4. Prefer data attributes and semantic tags; use class/aria keywords (job, description, contact, location, suburb, date).
- **Output**: `{ suggestedConfig: SourceExtractionConfig, diagnostics: { pageTitle, pageUrl, candidateContainerCount, chosenLeadCardSelector, chosenLeadCardCount, warnings? } }`.

---

## 3. Heuristics (practical)

- Containers: `page.locator('article')`, `page.locator('[data-testid]')`, etc.; count matches; prefer 2+ with links/data-attrs.
- Field selectors: relative to card – try `h1,h2,h3,h4`, `p`, `[class*="description"]`, `a[href*="/lead/"]`, etc.; pick first that returns non-empty. No hipages-specific strings.

---

## 4. Suggested config and preview

- Map to existing SourceExtractionConfig; omit optional fields if not found.
- Preview: `extractLeadsFromPage(page, suggestedConfig)` then `leads.slice(0, 5)`; return in API. Read-only, no Firestore.

---

## 5. Save extraction config

- **API**: `POST /api/control-centre/leads/save-extraction-config` with `{ sourceId, extractionConfig }`. Auth: requireControlCentreAuth.
- **sources-admin**: Add `updateSourceExtractionConfigAdmin(sourceId, extractionConfig)` – update extractionConfig + updatedAt.

---

## 6. UI

- SourceDetailsDrawer: "Analyze Page" button when canScan; on click POST analyze-page, show result in new modal.
- **AnalyzePageModal**: Diagnostics (page title, URL, candidate count, chosen selector, card count, warnings), suggested config (read-only), preview table (3–5 rows: externalId, title, description, suburb, postcode), "Save Extraction Config" (POST save-extraction-config, close, refresh source), "Close".

---

## 7. Generic / diagnostics

- No platform-specific logic. Best-effort suggestions; diagnostics include warnings if confidence low.
- Diagnostics: pageTitle, pageUrl, candidateContainerCount, chosenLeadCardSelector, chosenLeadCardCount, previewLeadCount, warnings.

---

## 8. Architecture

- page-analyzer.ts: DOM only, no UI, no Firestore.
- API analyze-page: auth, open page, analyzer, preview, return.
- API save-extraction-config: auth, updateSourceExtractionConfigAdmin.
- UI: drawer button + AnalyzePageModal.

---

## 9. Files to add/change

| Action | File |
|--------|------|
| Add | lib/leads/scanning/page-analyzer.ts |
| Add | app/api/control-centre/leads/analyze-page/route.ts |
| Add | app/api/control-centre/leads/save-extraction-config/route.ts |
| Edit | lib/leads/sources-admin.ts – updateSourceExtractionConfigAdmin |
| Add | app/control-centre/leads/AnalyzePageModal.tsx |
| Edit | app/control-centre/leads/SourceDetailsDrawer.tsx – Analyze Page button + modal |

---

## 10. Preserve scan pipeline

- No changes to background-scan-runner or selector-extractor for normal scans. Analyze Page is setup-only.
