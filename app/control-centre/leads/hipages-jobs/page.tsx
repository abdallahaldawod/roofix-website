import { HipagesJobsPageClient } from "./HipagesJobsPageClient";

export const metadata = {
  title: "Hipages jobs | Control Centre",
  robots: { index: false, follow: false } as const,
};

export default function HipagesJobsPage() {
  return <HipagesJobsPageClient />;
}
