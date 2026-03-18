/**
 * Server-only: perform accept / decline / waitlist on hipages using the source's saved session.
 * Used by the API route and by the background scan runner when rule set trigger platform actions are set.
 */

import { chromium } from "playwright";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import { updateActivityFieldsAdmin } from "@/lib/leads/activity-admin";

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
      try {
        const form = page.locator(formSelector).first();
        await form.waitFor({ state: "visible", timeout: 8_000 });
        const submitBtn = form.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click({ force: true });
          confirmed = true;
        } else {
          await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
          confirmed = true;
        }
      } catch {
        for (const btnText of ["Confirm", "Accept", "Yes", "Submit"]) {
          try {
            const btn = page.getByRole("button", { name: new RegExp(btnText, "i") }).first();
            await btn.waitFor({ state: "visible", timeout: 2_000 });
            await btn.click({ force: true });
            confirmed = true;
            break;
          } catch {
            continue;
          }
        }
      }
      if (!confirmed) {
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

    if (ok && action === "accept" && typeof leadId === "string" && leadId.trim()) {
      await updateActivityFieldsAdmin(leadId.trim(), { platformAccepted: true }).catch(() => {});
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
