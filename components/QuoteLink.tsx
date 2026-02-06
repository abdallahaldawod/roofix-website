"use client";

import Link from "next/link";
import { trackQuoteClick } from "@/lib/analytics/ga4";

type QuoteLinkProps = {
  href: string;
  children: React.ReactNode;
  /** Location for GA4 quote_click (e.g. "project_sidebar", "project_cta"). */
  location?: string;
  className?: string;
  [key: string]: unknown;
};

export default function QuoteLink({
  href,
  children,
  location = "link",
  className,
  ...rest
}: QuoteLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackQuoteClick(location)}
      {...rest}
    >
      {children}
    </Link>
  );
}
