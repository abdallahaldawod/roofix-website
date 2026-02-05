"use client";

import { useState } from "react";
import ProjectGrid, { type ProjectCategory } from "@/components/ProjectGrid";

type ProjectItem = {
  id: string;
  title: string;
  category: ProjectCategory;
  suburb?: string;
  imageUrl?: string;
};

type Props = {
  projects: ProjectItem[];
  showFilter?: boolean;
  carouselOnMobile?: boolean;
};

export default function ProjectsSection({ projects, showFilter = true, carouselOnMobile = false }: Props) {
  const [activeFilter, setActiveFilter] = useState<ProjectCategory | "all">("all");
  return (
    <ProjectGrid
      projects={projects}
      showFilter={showFilter}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      carouselOnMobile={carouselOnMobile}
    />
  );
}
