import { getMainJobDetailInitScript } from "@/lib/leads/scanning/hipages-jobs-main-detail-inpage-load";
import { getCustomerEnquiryInitScript } from "@/lib/leads/scanning/hipages-jobs-customer-enquiry-inpage-load";

/** Register in-browser extractors on `window` (required before job page scrapes). */
export async function installHipagesJobPageInpageScripts(page: {
  addInitScript: (opts: { content: string }) => Promise<void>;
}): Promise<void> {
  await page.addInitScript({ content: getMainJobDetailInitScript() });
  await page.addInitScript({ content: getCustomerEnquiryInitScript() });
}
