"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateContentCache } from "@/lib/data";

async function doRefreshPublicSiteCache(projectId?: string): Promise<void> {
  invalidateContentCache();
  revalidatePath("/", "layout");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/services");
  revalidatePath("/services/[slug]", "page");
}

/** Clears the in-memory content cache and revalidates public pages. Use for programmatic calls. */
export async function refreshPublicSiteCache(projectId?: string): Promise<void> {
  await doRefreshPublicSiteCache(projectId);
}

/** Server action for the dashboard "Refresh public site cache" form. */
export async function refreshPublicSiteCacheFormAction(formData: FormData): Promise<void> {
  const projectId = formData.get("projectId")?.toString() || undefined;
  await doRefreshPublicSiteCache(projectId);
  redirect("/control-centre?cacheRefreshed=1");
}
