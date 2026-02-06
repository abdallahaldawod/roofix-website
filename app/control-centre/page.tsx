import { getServices } from "@/lib/data";
import { DashboardCards } from "./dashboard-cards";

export default async function ControlCentreDashboardPage() {
  const services = await getServices({ includeInactive: true });
  const servicesTitles = services.map((s) => s.title);

  return (
    <div className="min-w-0">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-600 sm:text-base">Manage website content.</p>
      </div>
      <DashboardCards servicesTitles={servicesTitles} />
    </div>
  );
}
