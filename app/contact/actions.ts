"use server";

import { headers } from "next/headers";
import { recordConversion } from "@/lib/conversions";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rateLimit";
import { getResendConfig, sendContactEmail } from "@/lib/resend";
import { writeIncomingLead } from "@/lib/leads/incoming";
import { processWebsiteLead } from "@/lib/leads/process-website-lead";
import type { IncomingLeadCreate } from "@/lib/leads/types";

type ActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  formData?: {
    name: string;
    email: string;
    suburb: string;
    message: string;
    phone: string;
    projectType: string;
    service: string;
  };
};

function required(value: FormDataEntryValue | null, field: string): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? null : `${field} is required`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string): boolean {
  return EMAIL_REGEX.test(s.trim());
}

export async function submitContactForm(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const name = formData.get("name");
  const phone = formData.get("phone");
  const email = formData.get("email");
  const suburb = formData.get("suburb");
  const service = formData.get("service");
  const projectType = formData.get("projectType");
  const message = formData.get("message");

  const fieldErrors: Record<string, string> = {};
  const nameErr = required(name, "Name");
  if (nameErr) fieldErrors.name = nameErr;
  const phoneStr = typeof phone === "string" ? phone.trim().replace(/\D/g, "") : "";
  const phoneErr = required(phone, "Phone");
  if (phoneErr) fieldErrors.phone = phoneErr;
  else if (phoneStr.length !== 10) fieldErrors.phone = "Phone must be 10 digits";
  const emailErr = required(email, "Email");
  if (emailErr) fieldErrors.email = emailErr;
  else if (typeof email === "string" && !isValidEmail(email)) fieldErrors.email = "Please enter a valid email address";
  const suburbErr = required(suburb, "Suburb");
  if (suburbErr) fieldErrors.suburb = suburbErr;
  const serviceErr = required(service, "Service");
  if (serviceErr) fieldErrors.service = serviceErr;
  const projectTypeErr = required(projectType, "Project type");
  if (projectTypeErr) fieldErrors.projectType = projectTypeErr;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors,
      formData: {
        name: typeof name === "string" ? name.trim() : "",
        email: typeof email === "string" ? email.trim() : "",
        suburb: typeof suburb === "string" ? suburb.trim() : "",
        message: typeof message === "string" ? message.trim() : "",
        phone: phoneStr,
        projectType: typeof projectType === "string" ? projectType.trim() : "",
        service: typeof service === "string" ? service.trim() : "",
      },
    };
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
  const attachments: { filename: string; content: Buffer }[] = [];
  for (const entry of formData.getAll("documents")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_FILE_SIZE) continue;
    attachments.push({
      filename: entry.name.replace(/^.*[/\\]/, "") || "attachment",
      content: Buffer.from(await entry.arrayBuffer()),
    });
  }
  const totalSize = attachments.reduce((sum, a) => sum + a.content.length, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return {
      success: false,
      error: "Total attachment size is too large (max 15MB total).",
    };
  }

  const ip = getClientIpFromHeaders(await headers());
  const { allowed } = checkRateLimit(`contact:${ip}`, { windowMs: 60_000, max: 5 });
  if (!allowed) {
    return { success: false, error: "Too many submissions. Please try again in a minute." };
  }

  const nameStr = String(name).trim();
  const emailStr = String(email).trim();
  const suburbStr = String(suburb).trim();
  const serviceStr = String(service).trim();
  const projectTypeStr = String(projectType).trim();
  const messageStr = String(message).trim();
  const serviceType = `${serviceStr} – ${projectTypeStr}`.trim();
  const title = serviceType;

  // Optional: extract Australian postcode (4 digits) from suburb string if present
  const postcodeMatch = suburbStr.match(/\b(\d{4})\b/);
  const postcode = postcodeMatch ? postcodeMatch[1] : undefined;

  const incomingPayload: IncomingLeadCreate = {
    customerName: nameStr,
    phone: phoneStr,
    email: emailStr,
    suburb: suburbStr,
    postcode,
    serviceType,
    title,
    description: messageStr,
    source: "roofix-website",
  };

  const incomingId = await writeIncomingLead(incomingPayload);
  if (incomingId) {
    try {
      const pipelineResult = await processWebsiteLead(incomingId, incomingPayload);
      if (!pipelineResult.ok) {
        console.warn("[Contact] Lead pipeline skipped:", pipelineResult.skipped);
      }
    } catch (e) {
      console.error("[Contact] Lead pipeline error:", e instanceof Error ? e.message : e);
    }
  } else {
    console.warn("[Contact] Incoming lead not saved: Firebase Admin is likely not configured.");
  }

  const config = getResendConfig();
  if (!config.ok) {
    return { success: false, error: config.error };
  }

  const payload = {
    name: nameStr,
    phone: phoneStr,
    email: emailStr,
    suburb: suburbStr,
    service: serviceStr,
    projectType: projectTypeStr,
    message: messageStr,
    submittedAt: new Date().toISOString(),
  };

  const result = await sendContactEmail(
    { apiKey: config.apiKey, to: config.to, from: config.from },
    payload,
    attachments
  );

  if (result.ok) {
    await recordConversion("lead_submit");
    return { success: true };
  }
  return { success: false, error: result.error };
}
