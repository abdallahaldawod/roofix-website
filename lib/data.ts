/**
 * Server-side data access for public pages.
 * Reads from Firestore via Admin SDK; falls back to empty if not configured.
 * Uses in-memory TTL cache (5 min) so Firestore is hit at most once per collection per 5 min – all other requests are instant.
 * Uses React cache() so each collection is only read once per request within the same render.
 */

import { cache } from "react";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { Project, Service, Testimonial } from "@/lib/firestore-types";
import type { PageContentMap, PageId } from "@/lib/page-content";
import { getDefaultPageContent } from "@/lib/page-content";

const PROJECTS_COLLECTION = "projects";
const SERVICES_COLLECTION = "services";
const TESTIMONIALS_COLLECTION = "testimonials";
const PAGES_COLLECTION = "pages";
const CONFIG_COLLECTION = "config";
const PROJECT_FILTERS_DOC = "projectFilters";

export type ProjectFilterCategory = { value: string; label: string };

const DEFAULT_PROJECT_FILTER_CATEGORIES: ProjectFilterCategory[] = [
  { value: "roofing", label: "Roofing" },
  { value: "gutters", label: "Gutters" },
  { value: "repairs", label: "Repairs" },
];

/** In-memory TTL cache: avoid hitting Firestore on every request. */
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const memoryCache = new Map<string, { data: unknown[]; expires: number }>();
const pageDocCache = new Map<string, { data: unknown; expires: number }>();

/** Call after content changes in control-centre so the next public request sees fresh data. */
export function invalidateContentCache(): void {
  memoryCache.clear();
  pageDocCache.clear();
}

async function getCollectionUncached<T>(collectionId: string): Promise<T[]> {
  if (!isFirebaseAdminConfigured()) return [];
  try {
    const db = getAdminFirestore();
    if (!db) return [];
    const snapshot = await db.collection(collectionId).get();
    // id must come last so Firestore document ID always wins (doc.data() may contain its own "id" field)
    const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as T & { id: string }));
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

async function getProjectFilterCategoriesUncached(): Promise<ProjectFilterCategory[]> {
  if (!isFirebaseAdminConfigured()) return DEFAULT_PROJECT_FILTER_CATEGORIES;
  try {
    const db = getAdminFirestore();
    if (!db) return DEFAULT_PROJECT_FILTER_CATEGORIES;
    const snap = await db.collection(CONFIG_COLLECTION).doc(PROJECT_FILTERS_DOC).get();
    const data = snap.data();
    const categories = data?.categories;
    if (!Array.isArray(categories) || categories.length === 0)
      return DEFAULT_PROJECT_FILTER_CATEGORIES;
    return categories
      .filter((c: unknown) => c && typeof c === "object" && "value" in c && "label" in c)
      .map((c: { value: string; label: string }) => ({ value: String(c.value), label: String(c.label) }));
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[data] config/projectFilters read failed", err);
    }
    return DEFAULT_PROJECT_FILTER_CATEGORIES;
  }
}

/** Cached per request so generateMetadata + page share one read per collection. */
async function getCollectionImpl<T>(collectionId: string): Promise<T[]> {
  return getCollectionWithMemoryCache<T>(collectionId);
}
const getCollection = cache(getCollectionImpl);

const CONFIG_CACHE_KEY = `${CONFIG_COLLECTION}/${PROJECT_FILTERS_DOC}`;

async function getProjectFilterCategoriesCached(): Promise<ProjectFilterCategory[]> {
  const now = Date.now();
  const entry = memoryCache.get(CONFIG_CACHE_KEY);
  if (entry && entry.expires > now) return entry.data as ProjectFilterCategory[];
  const data = await getProjectFilterCategoriesUncached();
  memoryCache.set(CONFIG_CACHE_KEY, { data, expires: now + MEMORY_CACHE_TTL_MS });
  return data;
}

export const getProjects = cache(async (): Promise<Project[]> => {
  try {
    const projects = await getCollection<Project>(PROJECTS_COLLECTION);
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
});

/** Public pages use getServices() for active only; control-centre can pass { includeInactive: true }. */
export const getServices = cache(async (opts?: { includeInactive?: boolean }): Promise<Service[]> => {
  try {
    const list = await getCollection<Service>(SERVICES_COLLECTION);
    const arr = Array.isArray(list) ? list : [];
    if (opts?.includeInactive) return arr;
    return arr.filter((s) => (s as { active?: boolean }).active !== false);
  } catch {
    return [];
  }
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
  try {
    const services = await getServices();
    const normal = (s: string) => s.toLowerCase().trim();
    const needle = normal(slug);
    return services.find((s) => normal(s.slug) === needle) ?? null;
  } catch {
    return null;
  }
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const services = await getServices();
  return services.map((s) => s.slug);
}

/** Project filter tabs shown on /projects (All + category labels). From Firestore config/projectFilters; same cache as other content. */
export const getProjectFilterCategories = cache(getProjectFilterCategoriesCached);

/** Single-doc cache for page content. */
async function getPageContentUncached<K extends PageId>(pageId: K): Promise<PageContentMap[K] | null> {
  if (!isFirebaseAdminConfigured()) return null;
  try {
    const db = getAdminFirestore();
    if (!db) return null;
    const snap = await db.collection(PAGES_COLLECTION).doc(pageId).get();
    const data = snap.data();
    if (!data || typeof data !== "object") return null;
    return data as PageContentMap[K];
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[data] Firestore read failed for pages/", pageId, err);
    }
    return null;
  }
}

async function getPageContentWithCache<K extends PageId>(pageId: K): Promise<PageContentMap[K] | null> {
  const key = `${PAGES_COLLECTION}/${pageId}`;
  const now = Date.now();
  const entry = pageDocCache.get(key);
  if (entry && entry.expires > now) return entry.data as PageContentMap[K] | null;
  const data = await getPageContentUncached(pageId);
  pageDocCache.set(key, { data, expires: now + MEMORY_CACHE_TTL_MS });
  return data;
}

/** Page content for Home, About, Contact. Uses Firestore when set; otherwise returns defaults. */
export const getPageContent = cache(async (pageId: PageId): Promise<PageContentMap[PageId]> => {
  const stored = await getPageContentWithCache(pageId);
  if (stored) return stored as PageContentMap[PageId];
  return getDefaultPageContent(pageId) as PageContentMap[PageId];
});
