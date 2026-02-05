import Link from "next/link";
import {
  HousePlus,
  RefreshCw,
  Sparkles,
  Droplets,
  Wrench,
  ClipboardCheck,
  Settings,
  AlertCircle,
  Building2,
  Home,
  type LucideIcon,
} from "lucide-react";

type ServiceCardProps = {
  title: string;
  description: string;
  href?: string | null;
  /** When provided, uses Lucide icon for this service slug. */
  slug?: string;
  /** Firestore icon name (roof, gutter, repair, etc.); used when slug has no mapping. */
  icon?: string;
};

const SLUG_ICON_MAP: Record<string, LucideIcon> = {
  "new-roof": HousePlus,
  "re-roof": RefreshCw,
  "roof-restoration": Sparkles,
  gutters: Droplets,
  repairs: Wrench,
  inspections: ClipboardCheck,
};

const NAME_ICON_MAP: Record<string, LucideIcon> = {
  roof: Home,
  gutter: Droplets,
  repair: Wrench,
  inspection: ClipboardCheck,
  maintenance: Settings,
  emergency: AlertCircle,
  strata: Building2,
};

const DEFAULT_ICON = HousePlus;

export default function ServiceCard({
  title,
  description,
  href,
  slug,
  icon,
}: ServiceCardProps) {
  const showLearnMore = typeof href === "string" && href.length > 0;
  const IconComponent =
    (slug && SLUG_ICON_MAP[slug]) ||
    (icon && NAME_ICON_MAP[icon]) ||
    DEFAULT_ICON;

  const content = (
    <>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-accent shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <IconComponent className="h-6 w-6" strokeWidth={2} />
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
