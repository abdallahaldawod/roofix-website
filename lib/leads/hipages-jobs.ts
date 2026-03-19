/**
 * Hipages jobs client data layer (re-exports).
 * Prefer importing from hipages-jobs-mapper / hipages-jobs-subscribe when tree-shaking matters.
 */

export {
  HIPAGES_JOBS_COLLECTION,
  DEFAULT_HIPAGES_JOBS_QUERY_LIMIT,
  mapFirestoreDocToHipagesJob,
} from "./hipages-jobs-mapper";
export { subscribeToHipagesJobs } from "./hipages-jobs-subscribe";
export type { SubscribeToHipagesJobsOptions } from "./hipages-jobs-subscribe";
