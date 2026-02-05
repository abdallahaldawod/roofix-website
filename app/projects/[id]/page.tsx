import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById, getProjects } from "@/lib/data";

const BASE_URL = "https://roofix.com.au";

const CATEGORY_LABELS: Record<string, string> = {
  roofing: "Roofing",
  gutters: "Gutters",
  repairs: "Repairs",
};

type Props = {
  params: Promise<{ id: string }>;
};

export const revalidate = 300;

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
    description: project.description || `Roofing and gutter project: ${project.title}. ${project.suburb ? project.suburb + "." : ""}`,
    openGraph: {
      title: `${project.title} | Roofix Projects`,
      description: project.description,
      url,
      type: "website",
      images: project.imageUrls?.[0] ? [{ url: project.imageUrls[0], alt: project.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title: project.title, description: project.description },
    alternates: { canonical: url },
  };
  } catch {
    return { title: "Project | Roofix - Roofing & Gutters" };
  }
}

export default async function ProjectDetailPage({ params }: Props) {
  try {
    const { id } = await params;
    const project = await getProjectById(id);
    if (!project) notFound();

  const categoryLabel = CATEGORY_LABELS[project.category] ?? project.category;
  const images = project.imageUrls ?? [];

  return (
    <>
      <section className="relative bg-neutral-900">
        <div className="aspect-[4/3] max-h-[70vh] w-full sm:aspect-video">
          {images[0] ? (
            <img
              src={images[0]}
              alt=""
              className="h-full w-full object-cover"
              sizes="100vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-800" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white sm:p-8 md:p-10">
          <div className="mx-auto max-w-4xl">
            <span className="text-xs font-medium uppercase tracking-wider text-accent">
              {categoryLabel}
            </span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {project.title}
            </h1>
            {project.suburb && (
              <p className="mt-2 text-lg text-neutral-200">{project.suburb}</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <dl className="space-y-6">
            <div>
              <dt className="text-sm font-medium uppercase tracking-wider text-neutral-500">Title</dt>
              <dd className="mt-1 text-lg font-semibold text-neutral-900">{project.title || "—"}</dd>
            </div>
            {project.suburb ? (
              <div>
                <dt className="text-sm font-medium uppercase tracking-wider text-neutral-500">Suburb</dt>
                <dd className="mt-1 text-neutral-700">{project.suburb}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm font-medium uppercase tracking-wider text-neutral-500">Category</dt>
              <dd className="mt-1 text-neutral-700">{categoryLabel}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium uppercase tracking-wider text-neutral-500">Description</dt>
              <dd className="mt-1 text-neutral-600">{project.description?.trim() || "—"}</dd>
            </div>
            {(project.tags ?? []).length > 0 ? (
              <div>
                <dt className="text-sm font-medium uppercase tracking-wider text-neutral-500">Tags</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {(project.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700"
                    >
                      {tag}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>

          {images.length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">Images</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((url) => (
                  <div
                    key={url}
                    className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                  >
                    <img
                      src={url}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 border-t border-neutral-200 pt-8">
            <Link
              href="/projects"
              className="inline-flex items-center text-sm font-semibold text-neutral-600 hover:text-neutral-900"
            >
              <span className="mr-1">←</span> Back to all projects
            </Link>
          </div>
        </div>
      </section>
    </>
  );
  } catch {
    notFound();
  }
}
