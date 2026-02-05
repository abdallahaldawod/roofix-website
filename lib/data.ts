/**
 * Server-side data access for public pages.
 * Reads from Firestore via Admin SDK; falls back to empty if not configured.
 * Uses in-memory TTL cache (5 min) so Firestore is hit at most once per collection per 5 min – all other requests are instant.
 * Uses React cache() so each collection is only read once per request within the same render.
 */

import { cache } from "react";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { Project, Service, Testimonial } from "@/lib/firestore-types";

const PROJECTS_COLLECTION = "projects";
const SERVICES_COLLECTION = "services";
const TESTIMONIALS_COLLECTION = "testimonials";

/** In-memory TTL cache: avoid hitting Firestore on every request. */
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const memoryCache = new Map<string, { data: unknown[]; expires: number }>();

/** Call after content changes in control-centre so the next public request sees fresh data. */
export function invalidateContentCache(): void {
  memoryCache.clear();
}

async function getCollectionUncached<T>(collectionId: string): Promise<T[]> {
  if (!isFirebaseAdminConfigured()) return [];
  try {
    const db = getAdminFirestore();
    const snapshot = await db.collection(collectionId).get();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T & { id: string }));
    // Only include items that have required fields (e.g. services need slug + title)
    const filtered =
      collectionId === SERVICES_COLLECTION
        ? items.filter((x) => x && typeof (x as { slug?: unknown }).slug === "string" && typeof (x as { title?: unknown }).title === "string")
        : items;
    filtered.sort((a, b) => {
      const oA = "order" in a && typeof (a as { order?: number }).order === "number" ? (a as { order: number }).order : 9999;
      const oB = "order" in b && typeof (b as { order?: number }).order === "number" ? (b as { order: number }).order : 9999;
      return oA - oB || ((a as { id: string }).id).localeCompare((b as { id: string }).id);
    });
    return filtered as T[];
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[data] Firestore read failed for collection", collectionId, err);
    }
    return [];
  }
}

async function getCollectionWithMemoryCache<T>(collectionId: string): Promise<T[]> {
  const now = Date.now();
  const entry = memoryCache.get(collectionId);
  if (entry && entry.expires > now) return entry.data as T[];

  const data = await getCollectionUncached<T>(collectionId);
  // Only cache non-empty results so we refetch when collection was empty (e.g. first services added)
  if (data.length > 0) {
    memoryCache.set(collectionId, { data: data as unknown[], expires: now + MEMORY_CACHE_TTL_MS });
  }
  return data;
}

/** Cached per request so generateMetadata + page share one read per collection. */
async function getCollectionImpl<T>(collectionId: string): Promise<T[]> {
  return getCollectionWithMemoryCache<T>(collectionId);
}
const getCollection = cache(getCollectionImpl);

export const getProjects = cache(async (): Promise<Project[]> => {
  const projects = await getCollection<Project>(PROJECTS_COLLECTION);
  if (projects.length > 0) return projects;
  return [];
});

/** Public pages use getServices() for active only; control-centre can pass { includeInactive: true }. */
export const getServices = cache(async (opts?: { includeInactive?: boolean }): Promise<Service[]> => {
  const list = await getCollection<Service>(SERVICES_COLLECTION);
  if (opts?.includeInactive) return list;
  return list.filter((s) => (s as { active?: boolean }).active !== false);
});

export const getTestimonials = cache(async (): Promise<Testimonial[]> => {
  const testimonials = await getCollection<Testimonial>(TESTIMONIALS_COLLECTION);
  if (testimonials.length > 0) return testimonials;
  return [];
});

export async function getProjectById(id: string): Promise<(Project & { id: string }) | null> {
  try {
    const projects = await getProjects();
    const project = projects.find((p) => (p as { id?: string }).id === id);
    if (!project) return null;
    return { ...project, id: (project as { id?: string }).id ?? id };
  } catch {
    return null;
  }
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const services = await getServices();
  return services.find((s) => s.slug === slug) ?? null;
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const services = await getServices();
  return services.map((s) => s.slug);
}
