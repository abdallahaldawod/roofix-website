import { getServices } from "@/lib/data";
import { DashboardCards } from "./dashboard-cards";

export default async function ControlCentreDashboardPage() {
  const services = await getServices({ includeInactive: true });
  const servicesTitles = services.map((s) => s.title);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-neutral-600">Manage website content.</p>
      </div>
      <DashboardCards servicesTitles={servicesTitles} />
    </div>
  );
}
