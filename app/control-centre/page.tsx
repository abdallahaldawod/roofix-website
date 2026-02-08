import { DashboardCards } from "./dashboard-cards";

export default function ControlCentreDashboardPage() {
  return (
    <div className="min-w-0">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-2 text-neutral-600 sm:text-base">
          Manage your website content and view analytics. Choose a section below to get started.
        </p>
      </header>
      <DashboardCards />
    </div>
  );
}
