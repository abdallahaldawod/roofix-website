import ServicesCrud from "./services-crud";

export default function ControlCentreServicesPage() {
  return (
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Services</h1>
      <p className="mt-1 text-sm text-neutral-600 sm:text-base">Changes here are saved to Firestore and appear on the public website.</p>
      <section className="mt-4 sm:mt-8">
        <ServicesCrud />
      </section>
    </div>
  );
}
