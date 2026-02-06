"use client";

import { useState } from "react";
import ProjectGrid from "@/components/ProjectGrid";
import type { ProjectFilterCategory } from "@/lib/data";

type ProjectItem = {
  id: string;
  title: string;
  category: string;
  suburb?: string;
  imageUrl?: string;
};

type Props = {
  projects: ProjectItem[];
  showFilter?: boolean;
  carouselOnMobile?: boolean;
  /** From Firestore config; used for filter tab labels and order. */
  filterCategories?: ProjectFilterCategory[];
};

export default function ProjectsSection({
  projects,
  showFilter = true,
  carouselOnMobile = false,
  filterCategories,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  return (
    <ProjectGrid
      projects={projects}
      showFilter={showFilter}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      carouselOnMobile={carouselOnMobile}
      filterCategories={filterCategories}
    />
  );
}
