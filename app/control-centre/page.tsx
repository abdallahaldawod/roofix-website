import { DashboardOverview } from "./dashboard-overview";
import { DashboardCards } from "./dashboard-cards";

export default function ControlCentreDashboardPage() {
  return (
    <div className="min-w-0">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-2 text-neutral-600 sm:text-base">
          Overview of your website and content. Manage pages, projects, services and view analytics.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="sr-only">At a glance</h2>
        <DashboardOverview />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Quick access
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Jump to a section to edit content or view reports.
        </p>
        <DashboardCards />
      </section>
    </div>
  );
}
