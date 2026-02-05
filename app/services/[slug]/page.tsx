import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import CTAButton from "@/components/CTAButton";
import ServiceCard from "@/components/ServiceCard";
import { getServiceBySlug, getServices } from "@/lib/data";

const BASE_URL = "https://roofix.com.au";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  try {
    const services = await getServices();
    const slugs = services.map((s) => s.slug);
    return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    const service = await getServiceBySlug(slug);
    if (!service) return { title: "Roofix - Roofing & Gutters" };
    const title = typeof service.title === "string" ? service.title : "Service";
    const description = typeof service.description === "string" ? service.description : "";
    const url = `${BASE_URL}/services/${slug}`;
    return {
      title: "Roofix - Roofing & Gutters",
      description: description || undefined,
      keywords: [title, "Sydney", "Roofix", "roofing", "gutters"],
      openGraph: {
        title: `${title} | Roofix - Roofing & Gutters Sydney`,
        description: description || undefined,
        url,
        type: "website",
        locale: "en_AU",
      },
      twitter: { card: "summary_large_image", title, description: description || undefined },
      alternates: { canonical: url },
    };
  } catch {
    return { title: "Roofix - Roofing & Gutters" };
  }
}

/** Ensure content is always string[] (Firestore can return string or malformed data). */
function normalizeContent(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export default async function ServicePage({ params }: Props) {
  try {
    const { slug } = await params;
    const service = await getServiceBySlug(slug);
    if (!service) notFound();

    const title = typeof service.title === "string" ? service.title : "Service";
    const description = typeof service.description === "string" ? service.description : "";
    const content = normalizeContent(service.content);

    let otherServices: Awaited<ReturnType<typeof getServices>> = [];
    try {
      const allServices = await getServices();
      otherServices = allServices.filter((s) => s.slug !== slug);
    } catch {
      otherServices = [];
    }

    return (
    <>
      <section className="bg-neutral-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-neutral-300">{description}</p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="prose prose-neutral max-w-none">
            {content.map((paragraph, i) => (
              <p key={i} className="mt-4 text-left text-neutral-600 first:mt-0">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="mt-10">
            <CTAButton href="/contact" label="Get a free quote" />
          </div>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
            Other services
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {otherServices.map((s) => (
              <ServiceCard
                key={s.slug}
                title={typeof s.title === "string" ? s.title : "Service"}
                description={typeof s.description === "string" ? s.description : ""}
                href={`/services/${s.slug}`}
                slug={s.slug}
                icon={s.icon}
              />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/services"
              className="text-sm font-semibold text-neutral-600 hover:text-neutral-900"
            >
              View all services
            </Link>
          </div>
        </div>
      </section>
    </>
  );
  } catch (e) {
    unstable_rethrow(e);
    if (process.env.NODE_ENV === "development") console.error("[ServicePage]", e);
    notFound();
  }
}
