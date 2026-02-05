"use server";

import { revalidatePath } from "next/cache";
import { invalidateContentCache } from "@/lib/data";

/** Clears the in-memory content cache and revalidates public pages so the next load shows fresh data. */
export async function refreshPublicSiteCache(projectId?: string) {
  invalidateContentCache();
  revalidatePath("/", "layout");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/services");
  revalidatePath("/services/[slug]", "page");
  return { ok: true };
}
