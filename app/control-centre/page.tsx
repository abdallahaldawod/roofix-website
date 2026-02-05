import { RefreshCw } from "lucide-react";
import { getServices } from "@/lib/data";
import { refreshPublicSiteCache } from "./actions";
import { DashboardCards } from "./dashboard-cards";

export default async function ControlCentreDashboardPage() {
  const services = await getServices({ includeInactive: true });
  const servicesTitles = services.map((s) => s.title);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-neutral-600">Manage website content.</p>
        </div>
        <form action={refreshPublicSiteCache} className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh public site cache
          </button>
        </form>
      </div>
      <DashboardCards servicesTitles={servicesTitles} />
    </div>
  );
}
