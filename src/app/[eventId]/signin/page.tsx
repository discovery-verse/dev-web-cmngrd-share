"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { sendSignInLinkToEmail } from "firebase/auth";
import { CalendarDays, MailCheck, Play } from "lucide-react";
import { auth, isDemo } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { EVENT_KEY } from "@/lib/event-context";
import { Button, Input } from "@/components/ui";
import { RichContent } from "@/components/rich-content";
import { EMAIL_FOR_SIGN_IN_KEY } from "@/lib/constants";
import { DEMO_EMAIL, demoSignIn } from "@/lib/demo";
import type { EventBrandingDTO } from "@/lib/api-types";

/**
 * Themed sign-in landing for a shareable per-event link (e.g. /summit/signin).
 * Same email-link/demo flow as the generic /signin, but branded with the
 * event's own logo/cover and pre-selects it as the member's current event
 * (via EVENT_KEY) so they land straight in it after signing in.
 */
export default function EventSignInPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  // undefined = loading, null = no such event, object = found.
  const [event, setEvent] = useState<EventBrandingDTO | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  useEffect(() => {
    let active = true;
    fetch(`/api/events/${eventId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { event: EventBrandingDTO }) => active && setEvent(data.event))
      .catch(() => active && setEvent(null));
    return () => {
      active = false;
    };
  }, [eventId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setSending(true);
    setError(null);
    try {
      window.localStorage.setItem(EVENT_KEY, eventId);
      if (isDemo) {
        await demoSignIn(target);
        router.replace("/");
        return;
      }
      await sendSignInLinkToEmail(auth, target, {
        url: `${window.location.origin}/auth/complete?event=${encodeURIComponent(eventId)}`,
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
      window.localStorage.setItem(EVENT_KEY, eventId);
      await demoSignIn(DEMO_EMAIL);
      router.replace("/");
    } catch {
      setError("Demo emulators aren't reachable — run: npm run demo:emulators");
      setSending(false);
    }
  }

  if (event === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center pt-safe">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cg-brand-mark.svg" alt="Common Ground" className="h-40 w-auto max-w-full" />
        <div>
          <h1 className="text-lg font-bold">We couldn&apos;t find that event</h1>
          <p className="mt-1 text-[15px] text-soft">This sign-in link may be out of date.</p>
        </div>
        <Link href="/signin" className="text-sm font-semibold text-clay">
          Go to the general sign-in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 pb-16 pt-safe">
      <div className="mb-10 flex flex-col items-center space-y-4 text-center">
        {event?.coverUrl && (
          <div className="w-full overflow-hidden rounded-card shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host */}
            <img src={event.coverUrl} alt="" className="h-40 w-full object-cover" />
          </div>
        )}
        {event?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host
          <img
            src={event.logoUrl}
            alt={event.name}
            className={`size-28 rounded-full border-4 border-paper bg-surface object-contain shadow-card ${
              event.coverUrl ? "-mt-14" : ""
            }`}
          />
        ) : !event?.coverUrl ? (
          // No branding images at all — a plain badge with the short name beats nothing.
          <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-full bg-clay-soft text-clay-deep shadow-card">
            <CalendarDays className="size-6" aria-hidden />
            <span className="text-sm font-bold uppercase tracking-wide">
              {event?.shortName || "?"}
            </span>
          </div>
        ) : null}
        <div>
          <h1 className="text-xl font-bold">{event?.name || "Common Ground"}</h1>
          <p className="mt-1 max-w-sm text-[15px] leading-relaxed text-soft">
            Sign in to join {event?.name || "the community"} on Common Ground.
          </p>
        </div>
      </div>

      {event && !event.allowSignups && !sentTo && (
        <div className="mb-4 rounded-card border border-amber/30 bg-amber-soft/60 p-4">
          <p className="text-[13px] font-semibold text-amber">This event is invite-only</p>
          <p className="mt-1 text-[13px] leading-relaxed text-soft">
            If an organiser has already added you, sign in below. Otherwise, ask
            them to add you first — new sign-ups are closed for this event.
          </p>
        </div>
      )}

      {sentTo ? (
        <div className="rounded-card bg-surface p-6 shadow-card">
          <MailCheck className="mb-3 size-8 text-sage" aria-hidden />
          <h2 className="text-lg font-bold">Check your email</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-soft">
            We sent a sign-in link to <span className="font-semibold text-ink">{sentTo}</span>.
            Open it on this device to continue — no password needed.
          </p>
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

      {event?.infoContent?.trim() && (
        <section className="mt-10 text-left">
          <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-faint">
            Event details
          </h2>
          <div className="rounded-card border border-line bg-surface p-5 shadow-card">
            <RichContent content={event.infoContent} />
          </div>
        </section>
      )}

      <footer className="mt-14 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cg-brand-mark.svg" alt="Common Ground" className="h-16 w-auto max-w-full" />
          <p className="max-w-xs text-[13px] leading-relaxed text-soft">
            <span className="font-semibold text-ink">Common Ground Connect:</span> A community of
            Christians in the marketplace — founders, non-profit leaders, and corporate
            executives, connecting around work and faith.
          </p>
        </div>
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
