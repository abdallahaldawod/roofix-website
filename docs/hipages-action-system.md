# Hipages action-button system

Code-grounded reference for hipages lead action buttons: detection, normalization, storage, UI, queue, worker execution, and post-action updates.

---

## 1. Action button matrix

| Action        | Detection | Stored as | Displayed | Queueable | Executable |
|---------------|-----------|-----------|-----------|-----------|------------|
| **Accept**    | Path contains `/accept`, label does not match "Join Waitlist". | `hipagesActions.accept` + `acceptLabel`. | Yes (green). | Yes. | Yes: form submit or dialog Confirm/Accept/Yes. |
| **Join Waitlist** | Path contains `/accept` and label matches "Join Waitlist" (normalized at scan); or path contains `/waitlist`. | `hipagesActions.waitlist` + `waitlistLabel`. For "Join Waitlist" on `/accept`, only waitlist is set (no accept). | Yes (orange). UI also treats Accept button with `acceptLabel === "Join Waitlist"` as waitlist (orange, sends action `"waitlist"` with accept path). | Yes. | Yes: popup + "Share my details" button. |
| **Decline**   | Path contains `/decline`. | `hipagesActions.decline` + `declineLabel`. | Yes (red). | Yes. | Yes: same confirm flow as Accept (form or dialog). |

---

## 2. Detection rules

**Source:** `lib/leads/scanning/adapters/hipages-adapter.ts` — inside card `evaluate`, over all `<a>` in the lead card.

- **Path:** `new URL(a.href).pathname` or `href.split("?")[0]`.
- **Label:** `a.innerText?.trim() ?? a.textContent?.trim() ?? ""`.

**Rules:**

- `path.includes("/accept")`:
  - If label matches `/join\s*waitlist/i` → set only `waitlist` + `waitlistLabel` (no accept).
  - Else → set `accept` + `acceptLabel`.
- `path.includes("/decline")` → `decline` + `declineLabel`.
- `path.includes("/waitlist")` → `waitlist` + `waitlistLabel`.

There is no separate "primary action" field; the UI and queue use the same `hipagesActions` keys.

---

## 3. Execution flow per action (Playwright)

**Entry:** `lib/leads/hipages-action.ts` — `performHipagesAction({ sourceId, actionPath, action, leadId })`.

**Common steps for all actions:**

1. Launch browser with source’s saved storage state.
2. `page.goto(leadsListUrl)` (source `leadsUrl` or `https://www.hipages.com.au/leads`).
3. Click action link: try in order `a[href="${actionPath}"]`, `a[href="${actionPathBase}"]`, `a[href^="${actionPathBase}"]` (6s visible timeout, scroll into view, force click).
4. `page.waitForTimeout(2_000)`.

**Accept:**

- If URL is action page (`currentUrl` includes `actionPathBase` or `/${action}`):
  - Wait for `form[action*="/accept"]` (8s), then submit via `button[type="submit"]` or `form.requestSubmit()`.
  - If form not found, try page buttons in order: "Share my details", "Confirm", "Accept", "Yes", "Submit" (getByRole button, 2s).
- Else (dialog flow):
  - Wait for dialog (getByRole("dialog"), getByRole("alertdialog"), or modal locator with form/button), 3s.
  - In dialog: try in order — `button[type="submit"]`, has-text("Confirm"), has-text("Accept"), has-text("Yes"), `input[type="submit"]`, or page `form[action*="/accept"]`.
  - Optionally wait for dialog hidden (20s / 15s).
- Success: `finalUrl` on hipages.com.au and (`dialogClosed` or `confirmed` or not still on action URL).

**Waitlist:**

- After common steps, if `action === "waitlist"`:
  - Wait for dialog (8s): getByRole("dialog"), getByRole("alertdialog"), or modal with form/button. Step failure: `waitlist_popup_not_found`.
  - Find "Share my details": try in order — `button[data-tracking-label="Share my details"]`, getByRole("button", { name: /share my details/i }), `button:has-text("Share my details")` (3s). Step failure: `share_details_button_not_found`.
  - Click button, then wait for dialog hidden (20s / 15s). Success: `confirmed` and `dialogClosed` (or timeout).

**Decline:**

- Same as Accept but `formSelector = form[action*="/decline"]` and action path/type decline. Same dialog confirm fallbacks (submit, Confirm, Accept, Yes, etc.).

**Final success check (all actions):**

- `ok = finalUrl.includes("hipages.com.au") && (dialogClosed || confirmed || !stillOnActionUrl)`.

---

## 4. Post-action updates

**Queue** (`lib/leads/action-queue-admin.ts`):

- Success: `markActionSuccess(id, resultSummary)` → Firestore `lead_action_queue`: `status: "success"`, `completedAt`, `resultSummary`, `error: null`.
- Failure: `markActionFailed(id, error)` → `status: "failed"`, `completedAt`, `error`.

**Activity** (`lib/leads/hipages-action.ts`, only when `ok && leadId`):

- If `action === "accept"`: `updateActivityFieldsAdmin(leadId, { platformAccepted: true })`.
- Always: `updateActivityAdmin(leadId, { hipagesActions: {} })` — clears action buttons after success.

**UI:**

- `lib/leads/action-queue-client.ts`: `subscribeToLeadActionQueue(leadIds, callback)` queries `lead_action_queue` with `where("leadId", "in", chunk)`, builds `ActionStatusByLeadAndAction` keyed by `${leadId}:${action}` (latest by `requestedAt`).
- `LeadsPageClient` uses this for button label and disabled: Pending…, Processing…, Accepted/Declined/Waitlisted, or "Failed: &lt;short error&gt;" with tooltip.

**Worker** (`lib/leads/scanning/action-queue-worker.ts`):

- On success and `action === "accept"`, sends push to admins (`lead_accepted`) with activity title.

---

## 5. Errors and failures

**Step names** returned from `performHipagesAction` on failure:

- `load_leads_list` — not used in return (throws).
- `click_action_link` — link not found on leads page.
- `waitlist_popup_not_found` — waitlist: dialog did not appear within 8s.
- `share_details_button_not_found` — waitlist: "Share my details" button not found.
- `wait_for_dialog` — accept/decline: dialog did not open after click.
- `confirm_submit` — dialog open but confirm button not found or click failed.
- `confirm_on_page` — on action page but form/confirm button not found.

Queue doc stores `error` (string); UI shows truncated error in button label and full error in tooltip.

**Browser unavailable** (Playwright launch/close errors): friendly message suggesting running from a machine where the browser is installed locally (Control Centre).

---

## 6. Selectors and locators reference

**Action link** (order of use):

- `a[href="${actionPath}"]`
- `a[href="${actionPathBase}"]`
- `a[href^="${actionPathBase}"]`

**Form (accept/decline on action page):**

- `form[action*="/accept"]` or `form[action*="/decline"]` (suffix `/${action}`).

**Waitlist popup:**

- `page.getByRole("dialog")`
- `page.getByRole("alertdialog")`
- `page.locator('[class*="modal"][class*="open"], [class*="Modal"], [class*="Dialog"], [data-state="open"]').filter({ has: page.locator("form, button") })`

**Share my details** (order):

- `page.locator('button[data-tracking-label="Share my details"]')`
- `page.getByRole("button", { name: /share my details/i })`
- `page.locator('button:has-text("Share my details")')`

**Dialog confirm (accept/decline):**

- Dialog-scoped: `button[type="submit"]`, `button:has-text("Confirm")`, `button:has-text("Accept")`, `button:has-text("Yes")`, `input[type="submit"]`.
- Page: `form[action*="/accept"]` or decline equivalent, then `requestSubmit()`.

**Fallback buttons on action page (when form fails):**

- getByRole("button", name: RegExp("Share my details" | "Confirm" | "Accept" | "Yes" | "Submit", "i")).

---

## 7. Gaps and recommended fixes

- **Accept vs Join Waitlist same href:** Both can use `/accept`; behavior is distinguished by label. At scan, "Join Waitlist" is normalized to waitlist only. In the UI, if the Accept button has `acceptLabel === "Join Waitlist"`, it is shown orange and sends action `"waitlist"` with the accept path. Documented here; no code change required.

- **Trigger-from-scan:** When the rule set has `triggerPlatformActions.accept` and the lead only has a waitlist path (Join Waitlist case), `background-scan-runner` and `reapply-rules` use `actionPath = hipagesActions.waitlist` and `effectiveAction = "waitlist"` so the waitlist flow runs. Documented here.

- **Success clears buttons:** On success, `updateActivityAdmin(leadId, { hipagesActions: {} })` removes all action paths so the lead no longer shows Accept/Decline/Waitlist buttons. Intentional; documented.

- **No primary action:** All present actions are shown; there is no single "primary" CTA or priority order in code. Documented.

---

## 8. File reference

| File | Role |
|------|------|
| `lib/leads/scanning/adapters/hipages-adapter.ts` | Detection and normalization (path + label → accept/decline/waitlist). |
| `lib/leads/hipages-action.ts` | Playwright execution; success updates activity (`platformAccepted`, `hipagesActions: {}`). |
| `lib/leads/action-queue-types.ts` | Action type and queue document shape. |
| `lib/leads/action-queue-admin.ts` | Create request, claim pending, mark success/failed. |
| `lib/leads/action-queue-executor.ts` | Execute one queue doc via `performHipagesAction`. |
| `lib/leads/scanning/action-queue-worker.ts` | One cycle: claim, execute, update queue and optional push. |
| `lib/leads/scanning/process-scanned-lead.ts` | Maps raw `hipagesActions` (and labels) to activity. |
| `lib/leads/activity-admin.ts` | `updateActivityAdmin`, `updateActivityFieldsAdmin`. |
| `app/api/control-centre/leads/action-queue/route.ts` | Enqueue API (POST). |
| `app/control-centre/leads/LeadsPageClient.tsx` | Buttons, `handleHipagesAction` (enqueue), queue status for labels. |
| `lib/leads/action-queue-client.ts` | `subscribeToLeadActionQueue` (Firestore subscription). |
| `lib/leads/scanning/background-scan-runner.ts` | Trigger platform action with `effectiveAction` (accept → waitlist when path is waitlist). |
| `app/api/control-centre/leads/reapply-rules/route.ts` | Same `effectiveAction` logic for reapply. |
