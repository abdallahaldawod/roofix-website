import { readFileSync } from "fs";
import { join } from "path";

let cached: string | null = null;

/** Raw browser expression from disk — not passed through TS emit / __name. */
export function getJobsListExtractJobRowsExpr(): string {
  if (!cached) {
    const raw = readFileSync(join(process.cwd(), "lib/leads/scanning/hipages-jobs-extract-inpage.eval.js"), "utf8");
    cached = raw.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "").trim();
  }
  return cached;
}
