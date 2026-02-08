import Link from "next/link";
import Image from "next/image";
import TrackedPhoneLink from "./TrackedPhoneLink";

const PHONE = "0497 777 755";
const EMAIL = "info@roofix.com.au";
const ABN = "53 653 752 651";
const LICENCE_NO = "399493C";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Footer() {
  return (
    <footer className="mt-0 bg-neutral-900 text-neutral-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-3">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/home" className="inline-block">
              <Image
                src="/logo-light.png"
                alt="Roofix - Roofing & Gutters"
                width={300}
                height={90}
                className="h-16 w-auto sm:h-20"
              />
            </Link>
            <p className="mt-2 text-sm">
              We&apos;ve got you covered. Licensed, insured roofing and gutters across Sydney.
            </p>
          </div>

          <div>
            <h3 className="border-b border-neutral-700 pb-2 text-sm font-semibold uppercase tracking-wider text-white">
              Contact
            </h3>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <TrackedPhoneLink
                  href={`tel:${PHONE.replace(/\s/g, "")}`}
                  location="footer"
                  className="flex min-h-[44px] items-center hover:text-accent-muted py-1 -my-1"
                >
                  {PHONE}
                </TrackedPhoneLink>
              </li>
              <li>
                <a
                  href={`mailto:${EMAIL}`}
                  className="flex min-h-[44px] items-center hover:text-accent-muted py-1 -my-1"
                >
                  {EMAIL}
                </a>
              </li>
              <li className="pt-1 text-neutral-400">
                <a
                  href="https://abr.business.gov.au/ABN/View?abn=53653752651"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent-muted"
                >
                  ABN: {ABN}
                </a>
              </li>
              <li className="text-neutral-400">
                <a
                  href="https://verify.licence.nsw.gov.au/details/Contractor%20Licence/1-3ZYKA9Z"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent-muted"
                >
                  Licence: {LICENCE_NO}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="border-b border-neutral-700 pb-2 text-sm font-semibold uppercase tracking-wider text-white">
              Quick links
            </h3>
            <nav className="mt-3 flex flex-col gap-0" aria-label="Footer">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="min-h-[44px] flex items-center text-sm hover:text-accent-muted py-1 -my-1"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 border-t border-neutral-800 pt-8 sm:flex-row sm:justify-end">
          <div className="flex gap-4" aria-label="Social links">
            <a
              href="https://www.facebook.com/RoofixRoofingAndGutters"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Facebook"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a
              href="#"
              className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Instagram"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.058 1.645-.07 4.849-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="#"
              className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="LinkedIn"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} Roofix – Roofing &amp; Gutters. All
          rights reserved.
        </p>
      </div>
    </footer>
  );
}
