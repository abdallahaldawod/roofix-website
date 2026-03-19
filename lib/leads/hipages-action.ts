/**
 * Server-only: perform accept / decline / waitlist on hipages using the source's saved session.
 * Used by the API route and by the background scan runner when rule set trigger platform actions are set.
 */

import { chromium } from "playwright";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import { updateActivityFieldsAdmin, updateActivityAdmin } from "@/lib/leads/activity-admin";

const HIPAGES_BASE = "https://www.hipages.com.au";
const VALID_ACTIONS = ["accept", "decline", "waitlist"] as const;
export type HipagesActionType = (typeof VALID_ACTIONS)[number];

export type PerformHipagesActionParams = {
  sourceId: string;
  actionPath: string;
  action: HipagesActionType;
  leadId?: string;
};

export type PerformHipagesActionResult =
  | { ok: true; finalUrl?: string }
  | { ok: false; error: string; step?: string };

/**
 * Loads the leads list, clicks the action link, and confirms the dialog/form.
 * Updates activity platformAccepted when action is "accept" and leadId is provided.
 */
export async function performHipagesAction(
  params: PerformHipagesActionParams
): Promise<PerformHipagesActionResult> {
  const { sourceId, actionPath, action, leadId } = params;

  if (!actionPath.startsWith("/leads/")) {
    return { ok: false, error: "actionPath must be a /leads/... path" };
  }
  if (!VALID_ACTIONS.includes(action)) {
    return { ok: false, error: "action must be accept, decline, or waitlist" };
  }

  const source = await getSourceByIdAdmin(sourceId);
  if (!source) return { ok: false, error: "Source not found" };
  if (!source.storageStatePath) {
    return { ok: false, error: "Source has no saved session — connect first" };
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStorageStatePath(source.storageStatePath);
  } catch {
    return { ok: false, error: "Invalid session path" };
  }

  const leadsListUrl = source.leadsUrl?.trim() ?? `${HIPAGES_BASE}/leads`;
  const actionPathBase = actionPath.split("?")[0];

  const actionLinkSelectors = [
    `a[href="${actionPath}"]`,
    `a[href="${actionPathBase}"]`,
    `a[href^="${actionPathBase}"]`,
  ];

  const formActionSuffix = `/${action}`;
  const formSelector = `form[action*="${formActionSuffix}"]`;

  let browser;
  let step = "";
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    step = "load_leads_list";
    await page.goto(leadsListUrl, { waitUntil: "load", timeout: 35_000 });

    step = "click_action_link";
    let linkClicked = false;
    for (const sel of actionLinkSelectors) {
      try {
        const link = page.locator(sel).first();
        await link.waitFor({ state: "visible", timeout: 6_000 });
        await link.scrollIntoViewIfNeeded();
        await link.click({ force: true });
        linkClicked = true;
        break;
      } catch {
        continue;
      }
    }

    if (!linkClicked) {
      await browser.close();
      return {
        ok: false,
        error: "Could not find the action link on the leads page. The lead may no longer be listed.",
        step: "click_action_link",
      };
    }

    await page.waitForTimeout(2_000);

    const currentUrl = page.url();
    const navigatedToActionPage = currentUrl.includes(actionPathBase) || currentUrl.includes(`/${action}`);

    let dialogClosed = false;
    let confirmed = false;

    if (navigatedToActionPage) {
      step = "confirm_on_page";
      // #region agent log
      fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:confirm_on_page entry", message: "confirm_on_page branch", data: { currentUrl, formSelector, actionPathBase, navigatedToActionPage }, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
      // #endregion
      try {
        const form = page.locator(formSelector).first();
        await form.waitFor({ state: "visible", timeout: 8_000 });
        // #region agent log
        fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:form visible", message: "form found", data: { formSelector }, timestamp: Date.now(), hypothesisId: "H1" }) }).catch(() => {});
        // #endregion
        const submitBtn = form.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click({ force: true });
          confirmed = true;
        } else {
          await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
          confirmed = true;
        }
      } catch (formErr) {
        const formErrMsg = formErr instanceof Error ? formErr.message : String(formErr);
        const diag = await page.evaluate((sel: string) => {
          const forms = document.querySelectorAll(sel);
          const allForms = document.querySelectorAll("form");
          const buttons = Array.from(document.querySelectorAll("button, input[type=submit]")).slice(0, 10).map((el) => (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "");
          return { formCount: forms.length, allFormCount: allForms.length, firstFormAction: allForms[0]?.getAttribute("action") ?? null, buttonTexts: buttons };
        }, formSelector).catch(() => ({ formCount: -1, allFormCount: -1, firstFormAction: null, buttonTexts: [] as string[] }));
        // #region agent log
        fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:form catch", message: "form wait or submit failed", data: { formErrMsg, formSelector, ...diag }, timestamp: Date.now(), hypothesisId: "H1-H2-H5" }) }).catch(() => {});
        // #endregion
        for (const btnText of ["Share my details", "Confirm", "Accept", "Yes", "Submit"]) {
          try {
            const btn = page.getByRole("button", { name: new RegExp(btnText, "i") }).first();
            await btn.waitFor({ state: "visible", timeout: 2_000 });
            await btn.click({ force: true });
            confirmed = true;
            // #region agent log
            fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:fallback button", message: "fallback button clicked", data: { btnText }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
            // #endregion
            break;
          } catch {
            // #region agent log
            fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:fallback button try", message: "button not found", data: { btnText }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
            // #endregion
            continue;
          }
        }
      }
      if (!confirmed) {
        // #region agent log
        const finalDiag = await page.evaluate((sel: string) => {
          const forms = document.querySelectorAll(sel);
          const allForms = document.querySelectorAll("form");
          const buttons = Array.from(document.querySelectorAll("button, input[type=submit]")).slice(0, 12).map((el) => (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value || el.getAttribute("aria-label") || el.tagName);
          return { formCount: forms.length, allFormCount: allForms.length, formActions: Array.from(allForms).map((f) => f.getAttribute("action")), buttonTexts: buttons };
        }, formSelector).catch(() => ({}));
        fetch("http://127.0.0.1:7842/ingest/107dfd3f-fb99-4625-a4ee-335b6070c3a1", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "da563a" }, body: JSON.stringify({ sessionId: "da563a", location: "hipages-action.ts:confirm_on_page error return", message: "confirm failed summary", data: { currentUrl, formSelector, ...finalDiag }, timestamp: Date.now(), hypothesisId: "all" }) }).catch(() => {});
        // #endregion
        await browser.close();
        return {
          ok: false,
          error: "Could not find the confirm form or button on the action page.",
          step: "confirm_on_page",
        };
      }
    } else {
      step = "wait_for_dialog";
      const dialogLocators = [
        page.getByRole("dialog"),
        page.getByRole("alertdialog"),
        page
          .locator(
            '[class*="modal"][class*="open"], [class*="Modal"], [class*="Dialog"], [data-state="open"]'
          )
          .filter({ has: page.locator("form, button") }),
      ];
      let dialog: Awaited<ReturnType<typeof page.getByRole>> | null = null;
      for (const loc of dialogLocators) {
        try {
          await loc.first().waitFor({ state: "visible", timeout: 3_000 });
          dialog = loc.first();
          break;
        } catch {
          continue;
        }
      }

      if (!dialog) {
        await browser.close();
        return {
          ok: false,
          error:
            "Confirmation dialog did not open after clicking the action link. The site may use a different flow.",
          step: "wait_for_dialog",
        };
      }

      step = "confirm_submit";
      const confirmSelectors: { loc: ReturnType<typeof page.locator>; isForm: boolean }[] = [
        { loc: dialog.locator('button[type="submit"]'), isForm: false },
        { loc: dialog.locator('button:has-text("Confirm")'), isForm: false },
        { loc: dialog.locator('button:has-text("Accept")'), isForm: false },
        { loc: dialog.locator('button:has-text("Yes")'), isForm: false },
        { loc: dialog.locator('input[type="submit"]'), isForm: false },
        { loc: page.locator(formSelector).first(), isForm: true },
      ];
      for (const { loc: sel, isForm } of confirmSelectors) {
        try {
          const el = sel.first();
          await el.waitFor({ state: "visible", timeout: 2_000 });
          if (isForm) {
            await el.evaluate((form: HTMLFormElement) => form.requestSubmit());
          } else {
            await el.click({ force: true });
          }
          confirmed = true;
          break;
        } catch {
          continue;
        }
      }

      if (!confirmed) {
        await browser.close();
        return {
          ok: false,
          error: "Could not find or click the confirm button in the dialog.",
          step: "confirm_submit",
        };
      }

      try {
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 20_000 });
        dialogClosed = true;
      } catch {
        try {
          await dialog.waitFor({ state: "hidden", timeout: 15_000 });
          dialogClosed = true;
        } catch {
          /* timeout */
        }
      }
    }

    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1_000);

    const finalUrl = page.url();
    const stillOnActionUrl = finalUrl.includes(actionPathBase);
    const ok =
      finalUrl.includes("hipages.com.au") && (dialogClosed || confirmed || !stillOnActionUrl);

    await browser.close();

    if (ok && typeof leadId === "string" && leadId.trim()) {
      const id = leadId.trim();
      if (action === "accept") {
        await updateActivityFieldsAdmin(id, { platformAccepted: true }).catch(() => {});
      }
      await updateActivityAdmin(id, { hipagesActions: {} }).catch(() => {});
    }

    return ok ? { ok: true, finalUrl } : { ok: false, error: "Action may not have completed; check hipages.", step: "confirm_submit" };
  } catch (e) {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, step: step || "unknown" };
  }
}
