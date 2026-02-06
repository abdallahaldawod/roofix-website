import type { Metadata } from "next";
import ServiceCard from "@/components/ServiceCard";
import CTAButton from "@/components/CTAButton";
import { getServices } from "@/lib/data";

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "New roof, re-roof, roof restoration, gutters, repairs and inspections across Sydney. Licensed and insured. Written warranty available.",
  keywords: [
    "roofing services Sydney",
    "gutter installation Sydney",
    "roof replacement Sydney",
    "roof repair Sydney",
    "roof restoration Sydney",
    "roof inspection Sydney",
  ],
  openGraph: {
    title: "Our Services | Roofix - Roofing & Gutters Sydney",
    description:
      "New roof, re-roof, roof restoration, gutters, repairs and inspections. Licensed, insured. Written warranty. Free quotes across Sydney.",
    url: "https://roofix.com.au/services",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "https://roofix.com.au/services" },
};

export const revalidate = 300;

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <>
      <section className="bg-neutral-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Our Services
          </h1>
          <p className="mt-4 text-neutral-300">
            New roof, re-roof, roof restoration, gutters, repairs and
            inspections across Sydney.
          </p>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <ServiceCard
                key={s.slug}
                title={s.title}
                description={s.description}
                href={`/services/${s.slug}`}
                slug={s.slug}
                icon={s.icon}
              />
            ))}
          </div>
          <div className="mt-12 text-center">
            <CTAButton href="/contact" label="Get a free quote" trackQuoteLocation="services" />
          </div>
        </div>
      </section>
    </>
  );
}
