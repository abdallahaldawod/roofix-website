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
  const handleClick = () => {
    trackCallClick(location);
    const payload = JSON.stringify({ type: "call_click", location });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/conversion", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  };

  return (
    <a
      href={href}
      className={className}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}
