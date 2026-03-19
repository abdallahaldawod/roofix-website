/**
 * One-off external lead scan by source id.
 *
 * Usage: npx tsx scripts/run-lead-scan.ts <sourceId>
 *        npm run lead-scan -- <sourceId>
 *
 * Requires Firebase Admin env vars and a lead source with platform that has an adapter (e.g. hipages).
 *
 * Env vars (optional):
 *   HIPAGES_STORAGE_STATE_PATH  Path to Playwright storage state file (from npm run bootstrap-hipages-auth). When set, the scan runs with this session.
 *   SCAN_STORAGE_STATE_PATH     Alternative to above; same effect. Use the same path for bootstrap and scan so one config works for both.
 * Relative paths are resolved from process.cwd().
 *
 * When neither env var is set, the script loads the source and uses the canonical leads session file
 * (same resolution as the leads scanner: storage-state.leads.json or legacy path from Firestore).
 */

import path from "path";
import { runExternalScan } from "../lib/leads/scanning/scan-runner";
import { getSourceByIdAdmin } from "../lib/leads/sources-admin";
import { resolveLeadsStorageStateAbsolute } from "../lib/leads/connection/session-persistence";

const sourceId = process.argv[2]?.trim();
if (!sourceId) {
  console.error("Usage: npx tsx scripts/run-lead-scan.ts <sourceId>");
  process.exit(1);
}

async function main() {
  const envPath =
    process.env.HIPAGES_STORAGE_STATE_PATH?.trim() ??
    process.env.SCAN_STORAGE_STATE_PATH?.trim();
  let storageStatePath: string | undefined = envPath
    ? path.resolve(process.cwd(), envPath)
    : undefined;

  if (!storageStatePath) {
    const source = await getSourceByIdAdmin(sourceId);
    if (source) {
      try {
        storageStatePath = resolveLeadsStorageStateAbsolute(source);
      } catch {
        /* no session file */
      }
    }
  }

  const authState = storageStatePath
    ? { storageStatePath }
    : undefined;

  return runExternalScan(sourceId, { headless: true, authState });
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
