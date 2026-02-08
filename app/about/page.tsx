import type { Metadata } from "next";
import CTAButton from "@/components/CTAButton";
import TrackedPhoneLink from "@/components/TrackedPhoneLink";
import { getPageContent } from "@/lib/data";
import type { AboutContent } from "@/lib/page-content";

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

export default async function AboutPage() {
  const content = (await getPageContent("about")) as AboutContent;
  return (
    <>
      <section className="bg-neutral-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {content.heroTitle}
          </h1>
          <p className="mt-4 text-neutral-300">
            {content.heroSubline}
          </p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-neutral-900">
            {content.whoWeAreTitle}
          </h2>
          {content.whoWeAreParagraphs.map((p, i) => (
            <p key={i} className="mt-4 text-neutral-600">
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900">
            {content.valuesTitle}
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {content.values.map((v) => (
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
            {content.ctaTitle}
          </h2>
          <p className="mt-4 text-neutral-600">
            {content.ctaSubline}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CTAButton href="/contact" label="Get a free quote" trackQuoteLocation="about" />
            <TrackedPhoneLink
              href={`tel:${content.phone.replace(/\s/g, "")}`}
              location="about"
              className="inline-flex items-center justify-center rounded-lg border-2 border-accent px-5 py-2.5 text-sm font-semibold text-accent hover:bg-accent-light"
            >
              Call {content.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </section>
    </>
  );
}
