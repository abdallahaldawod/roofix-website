import Link from "next/link";
import CTAButton from "@/components/CTAButton";

export default function NotFound() {
  return (
    <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        {/* Simple icon: document with question */}
        <span
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
          aria-hidden
        >
          <svg
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </span>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          This page doesn&apos;t exist or may have been moved. No worries—you
          can head back home or get in touch for a quote.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <CTAButton href="/" label="Go to homepage" />
          <Link
            href="/contact"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            Contact / Get a quote
          </Link>
        </div>
      </div>
    </section>
  );
}
