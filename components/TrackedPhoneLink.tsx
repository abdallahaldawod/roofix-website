"use client";

import { trackCallClick } from "@/lib/analytics/ga4";

type TrackedPhoneLinkProps = {
  href: string;
  children: React.ReactNode;
  /** Location for GA4 call_click (e.g. "header", "footer", "contact"). */
  location?: string;
  className?: string;
  [key: string]: unknown;
};

export default function TrackedPhoneLink({
  href,
  children,
  location = "link",
  className,
  ...rest
}: TrackedPhoneLinkProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => trackCallClick(location)}
      {...rest}
    >
      {children}
    </a>
  );
}
