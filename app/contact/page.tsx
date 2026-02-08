import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import TrackedPhoneLink from "@/components/TrackedPhoneLink";
import { getServices, getPageContent } from "@/lib/data";
import type { ContactContent } from "@/lib/page-content";

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "Get a free quote for roofing and gutters in Sydney. Call 0497 777 755 or fill in the form. Licensed, insured, fast quotes.",
  keywords: ["contact Roofix", "roofing quote Sydney", "free quote gutters Sydney"],
  openGraph: {
    title: "Contact Roofix | Free Quote | Roofing & Gutters Sydney",
    description: "Get a free quote. Call or fill in the form. Licensed, insured. We've got you covered.",
    url: "https://roofix.com.au/contact",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "https://roofix.com.au/contact" },
};

export default async function ContactPage() {
  const [services, content] = await Promise.all([
    getServices(),
    getPageContent("contact").then((c) => c as ContactContent),
  ]);
  const serviceOptions = services.length > 0
    ? services.map((s) => s.title)
    : ["New Roof", "Re-Roof", "Roof Restoration", "Gutters", "Repairs", "Inspections", "Other"];

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

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h2 className="text-xl font-bold text-neutral-900">
                {content.getInTouchTitle}
              </h2>
              <p className="mt-2 text-lg font-medium text-neutral-800">
                {content.getInTouchSubtitle}
              </p>
              <p className="mt-3 text-neutral-600">
                {content.introParagraph}
              </p>

              <div className="mt-8 space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Contact
                </h3>
                <TrackedPhoneLink
                  href={`tel:${content.phone.replace(/\s/g, "")}`}
                  location="contact_page"
                  className="flex min-h-[44px] items-center gap-3 rounded-lg py-2 pr-3 text-neutral-700 font-semibold hover:text-accent active:bg-neutral-100"
                >
                  <span className="text-accent shrink-0" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </span>
                  {content.phone}
                </TrackedPhoneLink>
                <a
                  href={`mailto:${content.email}`}
                  className="flex min-h-[44px] items-center gap-3 rounded-lg py-2 pr-3 text-neutral-700 font-semibold hover:text-accent active:bg-neutral-100"
                >
                  <span className="text-accent shrink-0" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  {content.email}
                </a>
              </div>

              <div className="mt-8 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Business details
                </h3>
                <ul className="space-y-2.5 text-sm text-neutral-700">
                  <li>
                    <span className="font-medium text-neutral-500">ABN</span>
                    {" "}
                    <a
                      href={`https://abr.business.gov.au/ABN/View?abn=${content.abn.replace(/\s/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent underline decoration-neutral-300 underline-offset-2 hover:decoration-accent"
                    >
                      {content.abn}
                    </a>
                  </li>
                  <li>
                    <span className="font-medium text-neutral-500">Contractor licence</span>
                    {" "}
                    <a
                      href="https://verify.licence.nsw.gov.au/details/Contractor%20Licence/1-3ZYKA9Z"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent underline decoration-neutral-300 underline-offset-2 hover:decoration-accent"
                    >
                      {content.licenceNo}
                    </a>
                  </li>
                  <li>
                    <span className="font-medium text-neutral-500">Service area</span>
                    <span className="ml-1.5">{content.serviceArea}</span>
                  </li>
                  <li>
                    <span className="font-medium text-neutral-500">Hours</span>
                    <span className="ml-1.5">{content.hours}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="order-1 lg:order-2 w-full self-start rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-md shadow-neutral-200/50 sm:p-6">
              <ContactForm serviceOptions={serviceOptions} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
