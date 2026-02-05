import { getProjects } from "@/lib/data";
import ProjectsSection from "@/components/ProjectsSection";
import { DEFAULT_PROJECTS } from "@/lib/default-projects";

export const revalidate = 300;

export default async function ProjectsPage() {
  const list = await getProjects();
  const projects = list.length > 0
    ? list.map((p) => ({
        id: p.id ?? "",
        title: p.title,
        category: p.category,
        suburb: p.suburb,
        imageUrl: p.imageUrls?.[0],
      }))
    : DEFAULT_PROJECTS.map((p, i) => ({
        id: `default-${i}`,
        title: p.title,
        category: p.category,
        suburb: p.suburb,
        imageUrl: undefined,
      }));

  return (
    <>
      <section className="bg-neutral-900 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Our Projects
          </h1>
          <p className="mt-4 text-neutral-300">
            A selection of our roofing and gutter work across Sydney and
            surrounds.
          </p>
        </div>
      </section>

      <section className="bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <ProjectsSection projects={projects} showFilter />
        </div>
      </section>
    </>
  );
}
