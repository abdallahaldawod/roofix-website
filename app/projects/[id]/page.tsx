import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { getProjectById, getProjects } from "@/lib/data";
import ProjectGallery from "@/components/ProjectGallery";
import { AppIcon } from "@/components/ui/AppIcon";
import TrackedPhoneLink from "@/components/TrackedPhoneLink";
import QuoteLink from "@/components/QuoteLink";

const BASE_URL = "https://roofix.com.au";
const PHONE = "0497 777 755";
const PHONE_LINK = "tel:0497777755";

const CATEGORY_LABELS: Record<string, string> = {
  roofing: "Roofing",
  gutters: "Gutters",
  repairs: "Repairs",
};

const TRUST_BADGES = [
  { label: "Fully insured", icon: "lucide:check-circle" },
  { label: "Licensed", icon: "lucide:badge-check" },
  { label: "Workmanship warranty", icon: "lucide:shield-check" },
  { label: "Sydney-wide service", icon: "lucide:map-pin" },
] as const;

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  try {
    const projects = await getProjects();
    return projects
      .map((p) => (p as { id?: string }).id)
      .filter(Boolean)
      .map((id) => ({ id: id! }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const project = await getProjectById(id);
    if (!project) return { title: "Project | Roofix - Roofing & Gutters" };
    const url = `${BASE_URL}/projects/${id}`;
    return {
      title: `${project.title} | Roofix - Roofing & Gutters`,
      description:
        project.description ||
        `Roofing and gutter project: ${project.title}. ${project.suburb ? project.suburb + "." : ""}`,
      openGraph: {
        title: `${project.title} | Roofix Projects`,
        description: project.description,
        url,
        type: "website",
        images: project.imageUrls?.[0]
          ? [{ url: project.imageUrls[0], alt: project.title }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: project.title,
        description: project.description,
      },
      alternates: { canonical: url },
    };
  } catch {
    return { title: "Project | Roofix - Roofing & Gutters" };
  }
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:items-start sm:gap-3 sm:text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
        {icon}
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="mt-0.5 font-medium text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

/** Resolved props only — avoids dev tools enumerating Promise params/searchParams. */
async function ProjectDetailContent({ id }: { id: string }) {
  let project: Awaited<ReturnType<typeof getProjectById>> = null;
  try {
    project = await getProjectById(id);
    if (!project) notFound();
  } catch {
    notFound();
  }
  if (!project) notFound();

  const categoryLabel =
    CATEGORY_LABELS[typeof project.category === "string" ? project.category : ""] ??
    (typeof project.category === "string" ? project.category : undefined) ??
    "Project";
  const images = Array.isArray(project.imageUrls)
    ? project.imageUrls.filter((u): u is string => typeof u === "string")
    : [];
  const tags = Array.isArray(project.tags)
    ? project.tags.filter((t): t is string => typeof t === "string")
    : [];
  const jobTypeTags = tags.length > 0 ? tags : [categoryLabel];
  const materialsList = project.materials && project.materials.length > 0
    ? project.materials
    : tags.length > 0
      ? tags
      : null;
  const hasStory =
    (project.problem?.trim() ?? "") !== "" ||
    (project.solution?.trim() ?? "") !== "" ||
    (project.result?.trim() ?? "") !== "";
  const roofType = project.roofType ?? categoryLabel;
  const duration = project.durationDays != null ? `${project.durationDays} days` : null;
  const materialsSummary =
    project.materials?.length
      ? project.materials.slice(0, 3).join(", ")
      : tags.length > 0
        ? tags.slice(0, 3).join(", ")
        : "—";

  return (
      <div className="min-h-screen bg-neutral-50">
        {/* 1. Hero */}
        <section className="relative h-[65vh] min-h-[420px] overflow-hidden bg-neutral-800">
          {images[0] ? (
            <img
              src={images[0]}
              alt=""
              className="h-full w-full object-cover"
              sizes="100vw"
            />
          ) : (
            <div className="h-full w-full bg-neutral-700" />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12">
            <div className="max-w-4xl">
              <Link
                href="/projects"
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/95 backdrop-blur-sm transition-all hover:border-accent/50 hover:bg-white/10 hover:text-accent"
              >
                <span aria-hidden>←</span> All projects
              </Link>
              <h1 className="text-3xl font-bold leading-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] sm:text-4xl md:text-5xl">
                {project.title}
              </h1>
              <p className="mt-3 text-lg text-white/90">
                {project.suburb ? `${project.suburb}, NSW` : "Sydney"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {jobTypeTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Summary strip */}
        <section className="border-b border-neutral-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              <SummaryItem
                icon={<AppIcon name="lucide:map-pin" size={20} />}
                label="Location"
                value={project.suburb ? `${project.suburb}, NSW` : "Sydney"}
              />
              <SummaryItem
                icon={<AppIcon name="lucide:clock" size={20} />}
                label="Duration"
                value={duration ?? "—"}
              />
              <SummaryItem
                icon={<AppIcon name="lucide:home" size={20} />}
                label="Roof type"
                value={roofType}
              />
              <SummaryItem
                icon={<AppIcon name="lucide:layers" size={20} />}
                label="Materials"
                value={materialsSummary}
              />
            </div>
          </div>
        </section>

        {/* 3. Main content: 2-column */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-16">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                The Job
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-neutral-700">
                {project.description?.trim() || "—"}
              </p>

              {hasStory && (
                <div className="mt-14 space-y-12">
                  {project.problem?.trim() && (
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">The Problem</h3>
                      <p className="mt-3 leading-relaxed text-neutral-600">
                        {project.problem.trim()}
                      </p>
                    </div>
                  )}
                  {project.solution?.trim() && (
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">The Solution</h3>
                      <p className="mt-3 leading-relaxed text-neutral-600">
                        {project.solution.trim()}
                      </p>
                    </div>
                  )}
                  {project.result?.trim() && (
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">The Result</h3>
                      <p className="mt-3 leading-relaxed text-neutral-600">
                        {project.result.trim()}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="lg:pt-0">
              <div className="sticky top-24 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Project details
                </h3>
                <dl className="mt-5 space-y-4">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                      Location
                    </dt>
                    <dd className="mt-0.5 font-medium text-neutral-900">
                      {project.suburb ? `${project.suburb}, NSW` : "Sydney"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                      Job type
                    </dt>
                    <dd className="mt-0.5 text-neutral-700">{categoryLabel}</dd>
                  </div>
                  {duration && (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                        Completion
                      </dt>
                      <dd className="mt-0.5 text-neutral-700">{duration}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-8 flex flex-col gap-3">
                  <QuoteLink
                    href="/contact"
                    location="project_sidebar"
                    className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-accent-hover"
                  >
                    Request a quote
                  </QuoteLink>
                  <TrackedPhoneLink
                    href={PHONE_LINK}
                    location="project_sidebar"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
                  >
                    <AppIcon name="lucide:phone" size={20} />
                    Call now
                  </TrackedPhoneLink>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* 4. Image gallery */}
        {images.length > 0 && (
          <section className="border-t border-neutral-200 bg-white py-12 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                Project gallery
              </h2>
              <p className="mt-2 text-neutral-600">
                Before, during and after. Click any image to expand.
              </p>
              <div className="mt-8">
                <ProjectGallery images={images} title={project.title} />
              </div>
            </div>
          </section>
        )}

        {/* 5. Materials & specs */}
        {(materialsList?.length ?? 0) > 0 && (
          <section className="border-t border-neutral-200 bg-neutral-50 py-12 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                Materials & specs
              </h2>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
                {materialsList!.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <AppIcon name="lucide:check" size={14} className="text-accent" />
                    </span>
                    <span className="text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* 6. Social proof */}
        <section className="border-t border-neutral-200 bg-white py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            {project.testimonialQuote?.trim() ? (
              <blockquote className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 sm:p-10">
                <p className="text-lg italic leading-relaxed text-neutral-700 sm:text-xl">
                  &ldquo;{project.testimonialQuote.trim()}&rdquo;
                </p>
                {project.testimonialAuthor && (
                  <footer className="mt-5 font-medium text-neutral-900">
                    — {project.testimonialAuthor}
                    {project.suburb ? `, ${project.suburb}` : ""}
                  </footer>
                )}
              </blockquote>
            ) : (
              <div className="rounded-2xl bg-gradient-to-b from-neutral-50 to-white py-10 ring-1 ring-neutral-200/60 sm:py-12">
                <div className="mx-auto max-w-4xl px-6 text-center sm:px-8">
                  <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                    Why choose Roofix
                  </p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                    Licensed, insured and covered
                  </h2>
                  <div className="mt-8 flex flex-nowrap items-center justify-center gap-x-8 gap-y-0 overflow-x-auto pb-1 sm:gap-x-10 sm:overflow-visible lg:gap-x-14">
                    {TRUST_BADGES.map((badge) => (
                      <div
                        key={badge.label}
                        className="flex shrink-0 items-center gap-3 text-neutral-700"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-sm ring-1 ring-neutral-200/80">
                          <AppIcon name={badge.icon} size={20} className="text-accent" />
                        </span>
                        <span className="text-left font-medium text-neutral-800">
                          {badge.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 7. Bottom CTA */}
        <section className="border-t border-neutral-200 bg-neutral-900 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Need similar work done?
            </h2>
            <p className="mt-3 text-lg text-neutral-300">
              Get a fast, no-obligation quote.
            </p>
            <div className="mt-8">
              <QuoteLink
                href="/contact"
                location="project_cta"
                className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3.5 text-base font-semibold text-neutral-900 transition-colors hover:bg-accent-hover"
              >
                Request a quote
              </QuoteLink>
            </div>
            <p className="mt-6 text-sm text-neutral-400">
              Or call us:{" "}
              <TrackedPhoneLink href={PHONE_LINK} location="project_cta" className="font-medium text-white underline hover:text-accent">
                {PHONE}
              </TrackedPhoneLink>
            </p>
          </div>
        </section>
      </div>
    );
}

/* @next-codemod-ignore - params awaited immediately; enumeration may come from dev tooling (e.g. component inspector). */
export default async function ProjectDetailPage(props: Props) {
  const { id } = await props.params;
  try {
    return <ProjectDetailContent id={id} />;
  } catch (e) {
    unstable_rethrow(e);
    if (process.env.NODE_ENV === "development") console.error("[ProjectDetailPage]", e);
    notFound();
  }
}
