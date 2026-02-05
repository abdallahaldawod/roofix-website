"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import { useControlCentreBase } from "../use-base-path";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const base = useControlCentreBase();
  const forbidden = searchParams.get("error") === "forbidden";
  const uid = searchParams.get("uid") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      router.replace(base || "/");
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password") || message.includes("auth/user-not-found")) {
        setError("Invalid email or password.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Control Centre</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to manage content.</p>

        {forbidden && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
            <p className="font-semibold">You don’t have admin access.</p>
            <p className="mt-2">
              In Firebase Console → Firestore, create a document so this account can sign in:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800">
              <li>Collection: <code className="rounded bg-amber-100 px-1">users</code></li>
              <li>Document ID: your user UID{uid ? ` (e.g. ${uid})` : " (from Authentication → Users)"}</li>
              <li>Field: <code className="rounded bg-amber-100 px-1">role</code> = <code className="rounded bg-amber-100 px-1">"admin"</code></li>
              <li>Optional: <code className="rounded bg-amber-100 px-1">email</code> = your email</li>
            </ul>
            <p className="mt-2 text-xs">Then try signing in again.</p>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-neutral-900 transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Not linked from the public site. Admin only.
        </p>
      </div>
      <Link href="/" className="mt-6 text-sm text-neutral-500 hover:text-neutral-700">
        ← Back to site
      </Link>
    </div>
  );
}

export default function ControlCentreLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <p className="text-neutral-600">Loading…</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
