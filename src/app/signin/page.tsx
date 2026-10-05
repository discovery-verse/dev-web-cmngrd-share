"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendSignInLinkToEmail } from "firebase/auth";
import { MailCheck, Play } from "lucide-react";
import { auth, isDemo } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button, Input } from "@/components/ui";
import { EMAIL_FOR_SIGN_IN_KEY } from "@/lib/constants";
import { DEMO_EMAIL, demoSignIn } from "@/lib/demo";

export default function SignInPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setSending(true);
    setError(null);
    try {
      if (isDemo) {
        // Demo mode: same magic-link flow, but the "email" is fetched
        // straight from the local Auth emulator — no inbox needed.
        await demoSignIn(target);
        router.replace("/");
        return;
      }
      await sendSignInLinkToEmail(auth, target, {
        url: `${window.location.origin}/auth/complete`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, target);
      setSentTo(target);
    } catch {
      setError(
        isDemo
          ? "Demo emulators aren't reachable — run: npm run demo:emulators"
          : "We couldn't send the link. Check the address and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleDemoEnter() {
    setSending(true);
    setError(null);
    try {
      await demoSignIn(DEMO_EMAIL);
      router.replace("/");
    } catch {
      setError("Demo emulators aren't reachable — run: npm run demo:emulators");
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 pb-16 pt-safe">
      <div className="mb-10 flex flex-col items-center space-y-4 text-center">
        {/* Brand lockup (mark + wordmark). eslint-disable: static local SVG,
            next/image adds no value for an inline logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cg-brand-mark.svg" alt="Common Ground" className="h-64 w-auto max-w-full sm:h-72" />
        <p className="max-w-sm text-[15px] leading-relaxed text-soft">
          A community of Christians in the marketplace — founders, non-profit
          leaders, and corporate executives, connecting around work and faith.
        </p>
      </div>

      {sentTo ? (
        <div className="rounded-card bg-surface p-6 shadow-card">
          <MailCheck className="mb-3 size-8 text-sage" aria-hidden />
          <h2 className="text-lg font-bold">Check your email</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-soft">
            We sent a sign-in link to <span className="font-semibold text-ink">{sentTo}</span>.
            Open it on this device to continue — no password needed.
          </p>
          <div className="mt-4 rounded-card border border-amber/30 bg-amber-soft/60 p-3">
            <p className="text-[13px] font-semibold leading-relaxed text-amber">
              Don&apos;t see it? Check your spam or junk folder.
            </p>
          </div>
          <button
            className="mt-4 text-sm font-semibold text-clay"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {isDemo && (
            <div className="mb-4 space-y-3 rounded-card border border-amber/30 bg-amber-soft/60 p-4">
              <p className="text-[13px] font-semibold text-amber">
                Demo mode — running on local emulators, no real emails are sent.
              </p>
              <Button
                type="button"
                onClick={handleDemoEnter}
                loading={sending}
                className="w-full"
              >
                <Play className="size-4" aria-hidden />
                Enter the demo
              </Button>
              <p className="text-[12px] leading-relaxed text-soft">
                Signs you in as the demo member (seeded with connections, chats,
                and an admin badge). Or use any email below to experience
                first-time onboarding — the magic link completes automatically.
              </p>
            </div>
          )}
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
          <Button type="submit" loading={sending} className="w-full">
            Email me a sign-in link
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="pt-2 text-center text-[13px] text-faint">
            No passwords here — we&apos;ll email you a secure link each time.
          </p>
        </form>
      )}

      <footer className="mt-14 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            By Digital Mission Ventures
          </span>
          <a
            href="https://www.digitalmissionventures.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dmv-logo.png"
              alt="Digital Mission Ventures"
              className="h-8 w-auto max-w-full"
            />
          </a>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Powered by
          </span>
          <a
            href="https://zavior.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/zavior-logo.svg"
              alt="Zavior"
              className="h-5 w-auto max-w-full"
            />
          </a>
        </div>
      </footer>
    </main>
  );
}
