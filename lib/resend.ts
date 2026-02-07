/**
 * Resend email for the contact form.
 * API key from env (lib/env). Same pattern as Google Places: key server-side only.
 */

import { getResendApiKey } from "@/lib/env";
import { Resend } from "resend";

export type ResendConfig =
  | { ok: true; apiKey: string; to: string; from: string }
  | { ok: false; error: string };

/** Resend default sender when no custom domain is used. Sends only to Resend account owner. */
const RESEND_DEFAULT_FROM = "Roofix Website <onboarding@resend.dev>";

export function getResendConfig(): ResendConfig {
  const apiKey = getResendApiKey();
  if (!apiKey || !apiKey.startsWith("re_")) {
    const isProd = process.env.NODE_ENV === "production";
    return {
      ok: false,
      error: isProd
        ? "RESEND_API_KEY is missing. Set the RESEND_API_KEY secret in Google Cloud Secret Manager and redeploy."
        : "RESEND_API_KEY is missing or invalid. Add it to .env.local (get a key at https://resend.com/api-keys). Restart the dev server after changing .env.local.",
    };
  }

  const to = process.env.CONTACT_FORM_TO_EMAIL?.trim();
  if (!to) {
    const isProd = process.env.NODE_ENV === "production";
    return {
      ok: false,
      error: isProd
        ? "CONTACT_FORM_TO_EMAIL is not set in production. Set it in App Hosting env (apphosting.yaml) to the email you used to sign up for Resend — with the default sender you can only send to that address."
        : "CONTACT_FORM_TO_EMAIL is not set in .env.local.",
    };
  }

  const fromRaw = process.env.CONTACT_FORM_FROM_EMAIL?.trim();
  const from = fromRaw || RESEND_DEFAULT_FROM;

  return { ok: true, apiKey, to, from };
}

export type ContactPayload = {
  name: string;
  phone: string;
  email: string;
  suburb: string;
  service: string;
  projectType: string;
  message: string;
  submittedAt: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export async function sendContactEmail(
  config: { apiKey: string; to: string; from: string },
  payload: ContactPayload,
  attachments: { filename: string; content: Buffer }[] = []
): Promise<SendResult> {
  const resend = new Resend(config.apiKey);

  const attachmentsRow =
    attachments.length > 0
      ? `<tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Attachments</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(attachments.map((a) => a.filename).join(", "))}</td></tr>`
      : "";

  const html = `
    <h2>New lead from Roofix contact form</h2>
    <table style="border-collapse: collapse; max-width: 500px;">
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Name</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.name)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Phone</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.phone)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Email</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.email)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Address / Suburb</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.suburb)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Project type</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.projectType)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5;"><strong>Service needed</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.service)}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e5e5; vertical-align: top;"><strong>Message</strong></td><td style="padding: 8px 12px; border: 1px solid #e5e5e5;">${escapeHtml(payload.message)}</td></tr>
      ${attachmentsRow}
    </table>
    <p style="margin-top: 16px; color: #525252; font-size: 12px;">Submitted at ${payload.submittedAt}</p>
  `;

  const { error } = await resend.emails.send({
    from: config.from,
    to: [config.to],
    subject: `New lead: ${payload.name} – ${payload.service}`,
    html,
    replyTo: payload.email,
    ...(attachments.length > 0 && { attachments }),
  });

  if (!error) return { ok: true };

  const code = "name" in error && typeof error.name === "string" ? error.name : "";
  const msg = typeof error.message === "string" ? error.message : String(error);
  // Log full error server-side so you can see Resend's real response in the terminal
  console.error("[Resend] Send failed:", JSON.stringify({ code, message: msg, name: code }, null, 2));

  if (code === "invalid_api_key" || code === "missing_api_key" || /api key/i.test(msg)) {
    const isProd = process.env.NODE_ENV === "production";
    return {
      ok: false,
      error: isProd
        ? "Resend API key was rejected. Update the RESEND_API_KEY secret in Google Cloud Secret Manager to a new key from https://resend.com/api-keys, then redeploy."
        : "Resend API key was rejected. Create a new key at https://resend.com/api-keys, set RESEND_API_KEY=re_xxx in .env.local (no quotes), and restart the dev server.",
    };
  }
  if (code === "invalid_from_address" || /from|domain|sender/i.test(msg)) {
    return {
      ok: false,
      error:
        "Sender address rejected. With no custom domain, leave CONTACT_FORM_FROM_EMAIL unset in production so Resend uses the default (onboarding@resend.dev). Or verify a domain at https://resend.com/domains and set CONTACT_FORM_FROM_EMAIL.",
    };
  }
  if (code === "invalid_attachment" || /attachment/i.test(msg)) {
    return { ok: false, error: "Attachments could not be sent. Try without attachments or use smaller files." };
  }
  if (/only send.*your own email|testing emails|recipient/i.test(msg)) {
    return {
      ok: false,
      error:
        "With the default sender you can only send to the email you used to sign up for Resend. Set CONTACT_FORM_TO_EMAIL (in apphosting.yaml or .env.local) to that address.",
    };
  }

  return { ok: false, error: "Email could not be sent. Please try again or contact us by phone." };
}
