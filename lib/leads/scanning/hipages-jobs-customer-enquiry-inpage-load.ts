import { readFileSync } from "fs";
import { join } from "path";

let cached: string | null = null;

/** Plain JS for `addInitScript` — defines `window.__roofixEnquiryDomDiag` and `window.__roofixRunCustomerEnquiry`. */
export function getCustomerEnquiryInitScript(): string {
  if (!cached) {
    const raw = readFileSync(
      join(process.cwd(), "lib/leads/scanning/hipages-jobs-customer-enquiry-inpage.eval.js"),
      "utf8"
    );
    cached = raw.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "").trim();
  }
  return cached;
}
