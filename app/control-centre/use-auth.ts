"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { UserDoc } from "@/lib/firestore-types";

const USERS_COLLECTION = "users";

export type AuthStatus = "loading" | "unconfigured" | "authenticated" | "unauthenticated" | "forbidden";

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  isAdmin: boolean;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    isAdmin: false,
  });

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState({ status: "unconfigured", user: null, isAdmin: false });
      return;
    }
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: "unauthenticated", user: null, isAdmin: false });
        return;
      }
      try {
        const db = getFirestoreDb();
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, user.uid));
        const data = userDoc.data() as UserDoc | undefined;
        const isAdmin = data?.role === "admin";
        setState({
          status: isAdmin ? "authenticated" : "forbidden",
          user,
          isAdmin,
        });
      } catch {
        setState({ status: "forbidden", user, isAdmin: false });
      }
    });
    return () => unsubscribe();
  }, []);

  return state;
}
