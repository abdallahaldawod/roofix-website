import Link from "next/link";

export type ProjectCategory = "roofing" | "gutters" | "repairs";

type ProjectItem = {
  id: string;
  title: string;
  category: ProjectCategory;
  suburb?: string;
  /** First image URL for card thumbnail (e.g. from Firestore) */
  imageUrl?: string;
};

type ProjectGridProps = {
  projects: ProjectItem[];
  showFilter?: boolean;
  activeFilter?: ProjectCategory | "all";
  onFilterChange?: (category: ProjectCategory | "all") => void;
  /** On small screens, show a horizontal scroll carousel instead of grid */
  carouselOnMobile?: boolean;
};

const categoryLabels: Record<ProjectCategory | "all", string> = {
  all: "All",
  roofing: "Roofing",
  gutters: "Gutters",
  repairs: "Repairs",
};

export default function ProjectGrid({
  projects,
  showFilter = false,
  activeFilter = "all",
  onFilterChange,
  carouselOnMobile = false,
}: ProjectGridProps) {
  const filtered =
    activeFilter === "all"
      ? projects
      : projects.filter((p) => p.category === activeFilter);

  const gridOrCarouselClass = carouselOnMobile
    ? "flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory -mx-4 pl-[7.5vw] pr-[7.5vw] sm:-mx-6 sm:pl-[7.5vw] sm:pr-[7.5vw] md:mx-0 md:px-0 md:overflow-visible md:grid md:grid-cols-2 md:gap-6 md:pb-0 lg:grid-cols-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div>
      {showFilter && onFilterChange && (
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {(["all", "roofing", "gutters", "repairs"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onFilterChange(cat)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeFilter === cat
                  ? "bg-accent text-neutral-900"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      )}
      <div className={gridOrCarouselClass}>
        {filtered.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className={`group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
              carouselOnMobile
                ? "shrink-0 w-[85vw] max-w-[320px] snap-center md:shrink md:w-auto md:max-w-none"
                : ""
            }`}
          >
            <div className="relative aspect-[4/3] bg-gradient-to-br from-neutral-200 to-neutral-300">
              {project.imageUrl ? (
                <img
                  src={project.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  sizes="(max-width: 768px) 85vw, 320px"
                />
              ) : null}
            </div>
            <div className="p-4">
              <span className="text-xs font-medium uppercase tracking-wider text-accent">
                {categoryLabels[project.category]}
              </span>
              <h3 className="mt-1 font-semibold text-neutral-900 group-hover:text-accent">
                {project.title}
              </h3>
              {project.suburb && (
                <p className="mt-0.5 text-sm text-neutral-500">{project.suburb}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
