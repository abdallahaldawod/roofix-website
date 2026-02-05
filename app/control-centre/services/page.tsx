import ServicesCrud from "./services-crud";

export default function ControlCentreServicesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Services</h1>
      <p className="mt-1 text-neutral-600">Changes here are saved to Firestore and appear on the public website.</p>
      <section className="mt-8">
        <ServicesCrud />
      </section>
    </div>
  );
}
