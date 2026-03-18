import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { requireControlCentreAuth } from "@/lib/control-centre-auth";
import { getSourceByIdAdmin } from "@/lib/leads/sources-admin";
import { resolveStorageStatePath } from "@/lib/leads/connection/session-persistence";
import { updateActivityFieldsAdmin } from "@/lib/leads/activity-admin";

const HIPAGES_BASE = "https://www.hipages.com.au";
const VALID_ACTIONS = ["accept", "decline", "waitlist"] as const;
type HipagesAction = (typeof VALID_ACTIONS)[number];

/**
 * POST: perform an accept / decline / waitlist action on a hipages lead
 * using the saved playwright session for the connected source.
 *
 * Body: { sourceId: string; actionPath: string; action: "accept" | "decline" | "waitlist" }
 * actionPath is the relative path stored in lead.hipagesActions (e.g. "/leads/{id}/accept")
 */
export async function POST(request: Request) {
  const authResult = await requireControlCentreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.message }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { sourceId, actionPath, action, leadId } = body as Record<string, unknown>;

  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return NextResponse.json({ ok: false, error: "sourceId is required" }, { status: 400 });
  }
  if (typeof actionPath !== "string" || !actionPath.startsWith("/leads/")) {
    return NextResponse.json({ ok: false, error: "actionPath must be a /leads/... path" }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(action as HipagesAction)) {
    return NextResponse.json({ ok: false, error: "action must be accept, decline, or waitlist" }, { status: 400 });
  }

  const source = await getSourceByIdAdmin(sourceId.trim());
  if (!source) return NextResponse.json({ ok: false, error: "Source not found" }, { status: 404 });
  if (!source.storageStatePath) {
    return NextResponse.json({ ok: false, error: "Source has no saved session — connect first" }, { status: 400 });
  }

  let absolutePath: string;
  try {
    absolutePath = resolveStorageStatePath(source.storageStatePath);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid session path" }, { status: 400 });
  }

  // actionPath is e.g. "/leads/{uuid}/decline".
  // The action link lives on the leads LIST page (source.leadsUrl). Load that page,
  // click the link to open the confirmation modal, then submit the form.
  const leadsListUrl = source.leadsUrl?.trim() ?? `${HIPAGES_BASE}/leads`;
  const actionPathBase = actionPath.split("?")[0];

  // Link that opens the modal: href may be exact or have query params.
  const actionLinkSelectors = [
    `a[href="${actionPath}"]`,
    `a[href="${actionPathBase}"]`,
    `a[href^="${actionPathBase}"]`,
  ];

  // Form in the modal to submit (most reliable); fallback: click submit button.
  const formActionSuffix = `/${action}`;
  const formSelector = `form[action*="${formActionSuffix}"]`;

  let browser;
  let step = "";
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: absolutePath });
    const page = await context.newPage();

    // ── Step 1: load leads list and click the action link ───────────────────
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
      return NextResponse.json({
        ok: false,
        error: "Could not find the action link on the leads page. The lead may no longer be listed.",
        step: "click_action_link",
      });
    }

    // Wait for either a confirmation dialog (modal) or navigation to the action URL (some flows open a new page).
    await page.waitForTimeout(2_000);

    const currentUrl = page.url();
    const navigatedToActionPage = currentUrl.includes(actionPathBase) || currentUrl.includes(`/${action}`);

    let dialogClosed = false;
    let confirmed = false;

    if (navigatedToActionPage) {
      // Flow 1: Click opened the action page (e.g. /tradie/jobs/leads/{id}/accept). Find and submit the confirm form on this page.
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
        return NextResponse.json({
          ok: false,
          error: "Could not find the confirm form or button on the action page.",
          step: "confirm_on_page",
        });
      }
    } else {
      // Flow 2: Modal opened on the same page. Find dialog (multiple possible selectors) and click confirm.
      step = "wait_for_dialog";
      const dialogLocators = [
        page.getByRole("dialog"),
        page.getByRole("alertdialog"),
        page.locator('[class*="modal"][class*="open"], [class*="Modal"], [class*="Dialog"], [data-state="open"]').filter({ has: page.locator("form, button") }),
      ];
      let dialog = null as Awaited<ReturnType<typeof page.getByRole>> | null;
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
        return NextResponse.json({
          ok: false,
          error: "Confirmation dialog did not open after clicking the action link. The site may use a different flow (e.g. navigate to a new page).",
          step: "wait_for_dialog",
        });
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
        return NextResponse.json({
          ok: false,
          error: "Could not find or click the confirm button in the dialog.",
          step: "confirm_submit",
        });
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
      (finalUrl.includes("hipages.com.au") && (dialogClosed || confirmed || !stillOnActionUrl));

    await browser.close();

    if (ok && action === "accept" && typeof leadId === "string" && leadId.trim()) {
      await updateActivityFieldsAdmin(leadId.trim(), { platformAccepted: true }).catch(() => {});
    }

    return NextResponse.json({
      ok,
      finalUrl,
      ...(ok ? {} : { error: "Action may not have completed; check hipages.", step: "confirm_submit" }),
    });
  } catch (e) {
    try { await browser?.close(); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, step: step || "unknown" },
      { status: 500 }
    );
  }
}
