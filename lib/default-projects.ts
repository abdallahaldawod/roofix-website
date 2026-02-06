/**
 * Default projects shown on the website when Firestore is empty.
 * Used as fallback in public pages and for "Import default projects" in control centre.
 */

import type { Project } from "@/lib/firestore-types";

export const DEFAULT_PROJECTS: Omit<Project, "id">[] = [
  { title: "Full roof replacement", suburb: "Manly", description: "", tags: [], category: "roofing", imageUrls: [] },
  { title: "Gutter & downpipe upgrade", suburb: "Bondi", description: "", tags: [], category: "gutters", imageUrls: [] },
  { title: "Tile repairs & reseal", suburb: "Parramatta", description: "", tags: [], category: "repairs", imageUrls: [] },
  { title: "Metal roof installation", suburb: "Chatswood", description: "", tags: [], category: "roofing", imageUrls: [] },
  { title: "Gutter cleaning & repair", suburb: "Marrickville", description: "", tags: [], category: "gutters", imageUrls: [] },
  { title: "Storm damage repair", suburb: "Hornsby", description: "", tags: [], category: "repairs", imageUrls: [] },
  { title: "Terracotta tile roof", suburb: "Mosman", description: "", tags: [], category: "roofing", imageUrls: [] },
  { title: "New gutter system", suburb: "Randwick", description: "", tags: [], category: "gutters", imageUrls: [] },
  { title: "Leak repair & flashing", suburb: "Burwood", description: "", tags: [], category: "repairs", imageUrls: [] },
];
