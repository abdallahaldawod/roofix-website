"use client";

import Link from "next/link";
import { trackQuoteClick } from "@/lib/analytics/ga4";

type CTAButtonProps = {
  href: string;
  label: string;
  variant?: "primary" | "primaryOutlined" | "secondary";
  fullWidth?: boolean;
  /** When set and href is /contact, sends quote_click with this location (e.g. "hero", "header"). */
  trackQuoteLocation?: string;
};

export default function CTAButton({
  href,
  label,
  variant = "primary",
  fullWidth,
  trackQuoteLocation,
}: CTAButtonProps) {
  const base =
    "inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#FFBC00] focus:ring-offset-2 active:scale-[0.98]";
  const primary =
    "btn-accent active:bg-[#E5A900]";
  const primaryOutlined =
    "border-2 border-neutral-900 btn-accent active:bg-[#E5A900]";
  const secondary =
    "btn-accent-outline active:bg-[#FFE066]/30";

  const variantClass =
    variant === "primary" ? primary : variant === "primaryOutlined" ? primaryOutlined : secondary;

  const isQuote = trackQuoteLocation && (href === "/contact" || href.endsWith("/contact"));

  return (
    <Link
      href={href}
      className={`${base} ${variantClass} ${fullWidth ? "w-full" : ""}`}
      onClick={() => isQuote && trackQuoteClick(trackQuoteLocation)}
    >
      {label}
    </Link>
  );
}
