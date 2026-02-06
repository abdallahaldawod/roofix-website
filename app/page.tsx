import type { Metadata } from "next";
import Link from "next/link";
import CTAButton from "@/components/CTAButton";
import TrackedPhoneLink from "@/components/TrackedPhoneLink";
import TestimonialCard from "@/components/TestimonialCard";
import FAQAccordion from "@/components/FAQAccordion";
import ProjectsSection from "@/components/ProjectsSection";
import ServicesSection from "@/components/ServicesSection";
import { getProjects, getTestimonials, getServices } from "@/lib/data";
import { DEFAULT_PROJECTS } from "@/lib/default-projects";
import { DEFAULT_TESTIMONIALS } from "@/lib/default-testimonials";

const PHONE = "0497 777 755";
const BASE_URL = "https://roofix.com.au";

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "Roofix – roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Licensed & insured. Written warranty. Free quotes. We've got you covered.",
  keywords: [
    "roofing Sydney",
    "gutters Sydney",
    "roof repair Sydney",
    "new roof Sydney",
    "roof replacement Sydney",
    "gutter installation Sydney",
  ],
  openGraph: {
    title: "Roofix - Roofing & Gutters Sydney | We've got you covered.",
    description:
      "Licensed, insured roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Free quotes.",
    url: BASE_URL,
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roofix - Roofing & Gutters Sydney",
    description: "Licensed, insured roofing and gutters. Free quotes. We've got you covered.",
  },
  alternates: { canonical: BASE_URL },
};

// Cache 5 min – data layer also uses 5 min memory cache so renders are instant after first load
export const revalidate = 300;

const TRUST_BADGES = [
  "Licensed & Insured",
  "10 Year Warranty",
  "Free Quotes",
  "5-Star Reviews",
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Request Quote",
    description: "Call us or fill in the form. We’ll arrange a time that suits you.",
  },
  {
    step: 2,
    title: "Inspection / Scope",
    description: "We inspect and provide a clear written quote. No obligation.",
  },
  {
    step: 3,
    title: "Complete & Warranty",
    description: "We complete the work to a high standard. Written warranty available.",
  },
];


const FAQ_ITEMS = [
  {
    question: "Are you licensed and insured?",
    answer: "Yes. We are fully licensed for roofing and gutter work and carry public liability and other relevant insurance. We can provide certificates on request.",
  },
  {
    question: "How quickly can I get a quote?",
    answer: "We aim to provide a written quote within 24–48 hours of the inspection. For urgent jobs we can often attend the same or next day.",
  },
  {
    question: "Do you offer warranty on your work?",
    answer: "Yes. Written warranty available. We stand behind our workmanship and use quality materials with manufacturer warranties where applicable.",
  },
  {
    question: "What areas do you service?",
    answer: "We service all of Sydney. Contact us to confirm your suburb.",
  },
  {
    question: "Do you do emergency repairs?",
    answer: "Yes. We offer emergency and urgent roof and gutter repairs. Call now for priority help.",
  },
  {
    question: "What payment options do you accept?",
    answer: "We accept bank transfer, cheque and card. Payment terms can be discussed at quote stage for larger jobs.",
  },
];

const LOCAL_BUSINESS_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "RoofingContractor",
  name: "Roofix - Roofing & Gutters",
  description:
    "Licensed, insured roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Free quotes. We've got you covered.",
  url: BASE_URL,
  telephone: "0497777755",
  email: "info@roofix.com.au",
  areaServed: { "@type": "City", name: "Sydney", "@id": "https://www.wikidata.org/wiki/Q3130" },
  priceRange: "$$",
  address: { "@type": "PostalAddress", addressRegion: "NSW", addressCountry: "AU" },
  sameAs: [],
  openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "07:00", closes: "17:00" },
};

export default async function Home() {
  // All from Firestore when FIREBASE_PROJECT_ID + FIREBASE_SERVICE_ACCOUNT_KEY are set
  const [projects, testimonials, services] = await Promise.all([
    getProjects(),
    getTestimonials(),
    getServices(),
  ]);
  const recentProjects = projects.length > 0
    ? projects.slice(0, 6).map((p) => ({
        id: p.id ?? "",
        title: p.title,
        category: p.category,
        suburb: p.suburb,
        imageUrl: p.imageUrls?.[0],
      }))
    : DEFAULT_PROJECTS.slice(0, 6).map((p, i) => ({
        id: `default-${i}`,
        title: p.title,
        category: p.category,
        suburb: p.suburb,
        imageUrl: undefined,
      }));
  const testimonialList = testimonials.length > 0
    ? testimonials.map((t) => ({ quote: t.quote, author: t.author, location: t.location, rating: t.rating ?? 5 }))
    : DEFAULT_TESTIMONIALS.map((t) => ({ quote: t.quote, author: t.author, location: t.location, rating: t.rating }));
  const serviceList = services.map((s) => ({ slug: s.slug, title: s.title, description: s.description, icon: s.icon }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSON_LD) }}
      />
      {/* Hero image - extends behind transparent header, full image visible */}
      <section
        className="relative -mt-24 min-h-[32rem] overflow-hidden sm:-mt-[6.5rem] sm:min-h-[40rem] lg:min-h-[48rem] xl:min-h-[56rem]"
        style={{
          backgroundImage: "url(/hero-house.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Hero content - under the image (headline + trust badges) */}
      <section className="border-b border-neutral-700 bg-neutral-900 px-4 py-6 text-white sm:px-6 sm:py-6 lg:px-8 lg:py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-center sm:text-left sm:text-2xl">
            We&apos;ve got you covered.
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-neutral-300 sm:justify-end sm:gap-6 lg:gap-8">
            {TRUST_BADGES.map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#FFBC00]" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Services – from Firestore (control centre). Requires FIREBASE_SERVICE_ACCOUNT_KEY in env. */}
      <ServicesSection services={serviceList} />

      {/* How it works - vertical on mobile, horizontal on md+ */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
            How It Works
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-neutral-600">
            Simple, transparent process from quote to completion.
          </p>
          <div className="relative mt-12">
            {/* Vertical dashed line (mobile only) */}
            <div
              className="absolute left-6 top-6 bottom-6 w-0 border-l-2 border-dashed border-neutral-300 md:hidden"
              aria-hidden
            />
            {/* Horizontal dashed line (md+ only) */}
            <div
              className="absolute left-[16.666667%] right-[16.666667%] top-6 hidden border-t-2 border-dashed border-neutral-300 md:block"
              aria-hidden
            />
            <ul className="flex flex-col gap-8 md:flex-row md:gap-0 md:justify-between">
              {HOW_IT_WORKS.map((item) => (
                <li
                  key={item.step}
                  className="relative flex flex-1 flex-row items-start gap-4 text-left md:flex-col md:items-center md:text-center md:px-4"
                >
                  {/* Step circle */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-lg font-bold text-neutral-900">
                    {item.step}
                  </div>
                  {/* Content */}
                  <div className="min-w-0 flex-1 pt-0.5 md:mt-4 md:max-w-[16rem] md:pt-0">
                    <h3 className="font-semibold text-neutral-900">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-neutral-600">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent Projects */}
      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
            Recent Projects
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-neutral-600">
            A sample of our roofing and gutter work across Sydney.
          </p>
          <div className="mt-10">
            <ProjectsSection projects={recentProjects} showFilter={false} carouselOnMobile />
          </div>
          <div className="mt-10 text-center">
            <CTAButton href="/projects" label="View all projects" />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
            What Our Customers Say
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-neutral-600">
            Real feedback from homeowners we&apos;ve worked with.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {testimonialList.map((t, i) => (
              <TestimonialCard
                key={t.author + String(i)}
                quote={t.quote}
                author={t.author}
                location={t.location}
                rating={t.rating}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-10">
            <FAQAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* Final CTA - flush with footer */}
      <section className="mb-0 bg-accent px-4 py-4 text-neutral-900 sm:px-6 sm:py-5 lg:px-8 lg:py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-bold sm:text-2xl">
              Ready for a Free Quote?
            </h2>
            <p className="mt-0.5 text-sm text-neutral-800 sm:text-base">
              We&apos;ve got you covered. Get in touch today.
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <TrackedPhoneLink
              href={`tel:${PHONE.replace(/\s/g, "")}`}
              location="hero"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-neutral-900 bg-transparent px-4 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-accent active:bg-neutral-900 active:text-accent"
            >
              Call {PHONE}
            </TrackedPhoneLink>
            <CTAButton href="/contact" label="Get a Free Quote" trackQuoteLocation="hero" />
          </div>
        </div>
      </section>
    </>
  );
}
