import { readFileSync } from "fs";
import { join } from "path";

let cached: string | null = null;

/** Plain JS for `page.addInitScript({ content })` — defines `window.__roofixRunMainDetail`. */
export function getMainJobDetailInitScript(): string {
  if (!cached) {
    const raw = readFileSync(
      join(process.cwd(), "lib/leads/scanning/hipages-jobs-main-detail-inpage.eval.js"),
      "utf8"
    );
    cached = raw.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "").trim();
  }
  return cached;
}
