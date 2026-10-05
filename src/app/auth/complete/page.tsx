"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { EMAIL_FOR_SIGN_IN_KEY } from "@/lib/constants";
import { EVENT_KEY } from "@/lib/event-context";
import { Button, Input, LoadingScreen } from "@/components/ui";

type Phase = "working" | "needEmail" | "error";

/**
 * Landing page for the magic link. If the link is opened on a different
 * device/browser than the one that requested it, localStorage won't have the
 * email — ask for it once to confirm, per the Firebase email-link flow.
 *
 * A per-event sign-in link (see /[eventId]/signin) embeds `?event=<id>` in
 * the continue URL, which survives the round trip through Firebase — that
 * lets the target event travel even to a different device than the one that
 * requested the link.
 */
export default function AuthCompletePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("working");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  // Read directly from the URL rather than useSearchParams() — this is a
  // fully client-rendered page already, no need for the Suspense boundary
  // that hook requires during prerendering.
  function rememberEvent() {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId) window.localStorage.setItem(EVENT_KEY, eventId);
  }

  async function complete(target: string) {
    try {
      await signInWithEmailLink(auth, target, window.location.href);
      window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
      rememberEvent();
      router.replace("/");
    } catch {
      setBusy(false);
      setPhase("error");
    }
  }

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      router.replace("/signin");
      return;
    }
    const stored = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
    if (stored) {
      signInWithEmailLink(auth, stored, window.location.href)
        .then(() => {
          window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
          rememberEvent();
          router.replace("/");
        })
        .catch(() => setPhase("error"));
    } else {
      // Deferred so the state change happens outside the effect body.
      void Promise.resolve().then(() => setPhase("needEmail"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <h1 className="text-xl font-bold">Sign-in link problem</h1>
        <p className="mt-2 text-[15px] text-soft">
          That link didn&apos;t work — it may have expired or already been used. Request a fresh
          one.
        </p>
        <Button className="mt-6" onClick={() => router.replace("/signin")}>
          Back to sign in
        </Button>
      </main>
    );
  }

  if (phase === "needEmail") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <h1 className="text-xl font-bold">Confirm your email</h1>
        <p className="mt-2 text-[15px] text-soft">
          Enter the address this sign-in link was sent to.
        </p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            setBusy(true);
            void complete(email.trim().toLowerCase());
          }}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email address"
          />
          <Button type="submit" loading={busy} className="w-full">
            Continue
          </Button>
        </form>
      </main>
    );
  }

  return <LoadingScreen label="Signing you in…" />;
}
