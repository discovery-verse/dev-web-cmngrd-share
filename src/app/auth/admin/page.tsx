"use client";

import { useEffect, useState } from "react";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { LoadingScreen } from "@/components/admin/ui";

const EMAIL_LINK_KEY = "cg-admin-emailForSignIn";

/**
 * Landing page for the admin magic link. Lives OUTSIDE the /higherground guard
 * (the visitor isn't signed in yet). Completes sign-in, then sends them to
 * /higherground where the layout confirms admin access.
 */
export default function AdminAuthCompletePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        if (!isSignInWithEmailLink(auth, window.location.href)) {
          window.location.href = "/higherground";
          return;
        }
        let email = window.localStorage.getItem(EMAIL_LINK_KEY);
        if (!email) email = window.prompt("Confirm your email to finish signing in") || "";
        await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
        window.localStorage.removeItem(EMAIL_LINK_KEY);
        window.location.href = "/higherground";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    }
    run();
  }, []);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-card">
          <p className="text-sm text-danger">{error}</p>
          <a href="/higherground" className="mt-4 inline-block text-sm font-semibold text-clay">
            Back to sign in
          </a>
        </div>
      </main>
    );
  }

  return <LoadingScreen label="Signing you in…" />;
}
