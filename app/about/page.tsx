import type { Metadata } from "next";
import CTAButton from "@/components/CTAButton";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "Learn about Roofix – licensed, insured roofing and gutter specialists in Sydney. Quality work and customer focus since day one. We've got you covered.",
  keywords: ["Roofix about", "roofing company Sydney", "gutter specialists Sydney"],
  openGraph: {
    title: "About Roofix | Roofing & Gutters Sydney",
    description:
      "Licensed, insured roofing and gutter specialists. Quality work and customer focus across Sydney.",
    url: "https://roofix.com.au/about",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "https://roofix.com.au/about" },
};

const VALUES = [
  {
    title: "Quality",
    description: "We use quality materials and work to a high standard so your roof and gutters last.",
  },
  {
    title: "Reliability",
    description: "We turn up on time, quote clearly, and communicate so you know what to expect.",
  },
  {
    title: "Trust",
    description: "Licensed, insured and warranty-backed. We stand behind our work.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="bg-neutral-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            About Roofix
          </h1>
          <p className="mt-4 text-neutral-300">
            Licensed, insured roofing and gutter specialists you can trust.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-neutral-900">
            Who We Are
          </h2>
          <p className="mt-4 text-neutral-600">
            Roofix specialises in roofing and gutters for homes and small
            commercial properties. We offer new installations, repairs,
            inspections and maintenance – all carried out by licensed,
            insured tradespeople who take pride in doing the job right.
          </p>
          <p className="mt-4 text-neutral-600">
            We believe in clear quotes, on-time work and standing behind what we
            do. Whether you need a full roof replacement, new gutters or a
            quick repair, we’re here to help.
          </p>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900">
            What We Stand For
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-neutral-200 bg-white p-6 text-center"
              >
                <h3 className="font-semibold text-neutral-900">{v.title}</h3>
                <p className="mt-2 text-sm text-neutral-600">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-neutral-900">
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-neutral-600">
            Get a free quote or give us a call to discuss your project.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CTAButton href="/contact" label="Get a free quote" />
            <Link
              href="tel:0497777755"
              className="inline-flex items-center justify-center rounded-lg border-2 border-accent px-5 py-2.5 text-sm font-semibold text-accent hover:bg-accent-light"
            >
              Call 0497 777 755
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
