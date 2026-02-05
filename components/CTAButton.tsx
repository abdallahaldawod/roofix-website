import Link from "next/link";

type CTAButtonProps = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export default function CTAButton({
  href,
  label,
  variant = "primary",
  fullWidth,
}: CTAButtonProps) {
  const base =
    "inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#FFBC00] focus:ring-offset-2 active:scale-[0.98]";
  const primary =
    "btn-accent active:bg-[#E5A900]";
  const secondary =
    "btn-accent-outline active:bg-[#FFE066]/30";

  return (
    <Link
      href={href}
      className={`${base} ${variant === "primary" ? primary : secondary} ${fullWidth ? "w-full" : ""}`}
    >
      {label}
    </Link>
  );
}
