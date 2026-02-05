"use client";

import ServiceCard from "@/components/ServiceCard";
import CTAButton from "@/components/CTAButton";

type ServiceItem = { slug: string; title: string; description: string; icon?: string };

type Props = { services: ServiceItem[] };

export default function ServicesSection({ services }: Props) {
  return (
    <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
          Our Services
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-neutral-600">
          New roof, re-roof, roof restoration, gutters, repairs and inspections across Sydney.
        </p>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 pl-[7.5vw] pr-[7.5vw] sm:-mx-6 sm:pl-[7.5vw] sm:pr-[7.5vw] md:mx-0 md:px-0 md:overflow-visible md:grid md:grid-cols-2 md:gap-6 md:pb-0 lg:grid-cols-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {services.map((s) => (
            <div
              key={s.slug}
              className="shrink-0 w-[85vw] max-w-[320px] snap-center md:shrink md:w-auto md:max-w-none md:snap-align-none"
            >
              <ServiceCard
                title={s.title}
                description={s.description}
                href={`/services/${s.slug}`}
                slug={s.slug}
                icon={s.icon}
              />
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <CTAButton href="/services" label="View all services" />
        </div>
      </div>
    </section>
  );
}
