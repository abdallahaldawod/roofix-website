import Link from "next/link";
import { AppIcon } from "@/components/ui/AppIcon";
import { getServiceIconifyName } from "@/lib/service-icons";
import type { ServiceIcon } from "@/lib/firestore-types";

type ServiceCardProps = {
  title: string;
  description: string;
  href?: string | null;
  /** When provided, overrides icon with a slug-specific Iconify name. */
  slug?: string;
  /** Firestore icon (roof, gutter, repair, etc.); used when slug has no override. */
  icon?: ServiceIcon | string;
};

const SLUG_ICON_OVERRIDE: Record<string, string> = {
  "new-roof": "lucide:house-plus",
  "re-roof": "lucide:refresh-cw",
  "roof-restoration": "lucide:sparkles",
  gutters: "lucide:droplets",
  repairs: "lucide:wrench",
  inspections: "lucide:clipboard-check",
};

const DEFAULT_ICONIFY = "lucide:house-plus";

function getIconifyName(slug?: string, icon?: ServiceIcon | string): string {
  if (slug && SLUG_ICON_OVERRIDE[slug]) return SLUG_ICON_OVERRIDE[slug];
  if (icon && typeof icon === "string") return getServiceIconifyName(icon);
  return DEFAULT_ICONIFY;
}

export default function ServiceCard({
  title,
  description,
  href,
  slug,
  icon,
}: ServiceCardProps) {
  const showLearnMore = typeof href === "string" && href.length > 0;
  const iconifyName = getIconifyName(slug, icon);

  const content = (
    <>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-accent shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <AppIcon name={iconifyName} size={24} className="text-accent" />
      </div>
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="text-sm text-neutral-600">{description}</p>
      {showLearnMore && (
        <span className="mt-2 inline-flex items-center text-sm font-medium text-accent">
          Learn more
          <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      )}
    </>
  );

  const className =
    "group flex flex-col rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-md";

  if (showLearnMore && href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
