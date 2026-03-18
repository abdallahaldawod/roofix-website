import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { LeadRuleSet, LeadRuleSetCreate, LeadRuleSetUpdate } from "./types";

const COLLECTION = "lead_rule_sets";

function toLeadRuleSet(id: string, d: DocumentData): LeadRuleSet {
  return {
    id,
    name: d.name ?? "",
    description: d.description ?? "",
    status: d.status ?? "Inactive",
    minScore: d.minScore ?? 0,
    requiredKeywords: d.requiredKeywords ?? [],
    excludedKeywords: d.excludedKeywords ?? [],
    scoringRules: d.scoringRules ?? [],
    locationFilters: d.locationFilters ?? [],
    thresholds: d.thresholds ?? { accept: 30, review: 15, reject: 0 },
    safetyControls: d.safetyControls ?? { maxLeadsPerDay: 50, cooldownMinutes: 30 },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function getRuleSets(): Promise<LeadRuleSet[]> {
  const db = getFirestoreDb();
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLeadRuleSet(d.id, d.data()));
}

export async function createRuleSet(data: LeadRuleSetCreate): Promise<string> {
  const db = getFirestoreDb();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRuleSet(
  id: string,
  data: LeadRuleSetUpdate
): Promise<void> {
  const db = getFirestoreDb();
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRuleSet(id: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, COLLECTION, id));
}
