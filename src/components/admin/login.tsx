"use client";

import { useState, type FormEvent } from "react";
import { sendSignInLinkToEmail } from "firebase/auth";
import { ShieldCheck } from "lucide-react";
import { auth, isDemo } from "@/lib/firebase";
import { demoSignIn } from "@/lib/demo";
import { useAuth } from "@/lib/auth-context";
import { Button, Field, Input } from "@/components/admin/ui";

const EMAIL_LINK_KEY = "cg-admin-emailForSignIn";

/**
 * Shown by the /higherground layout whenever the visitor isn't a signed-in
 * admin. Two states: signed out (magic-link sign-in) or signed in but not an
 * admin (dead end + switch account). Once a real admin signs in, AuthProvider
 * updates and the layout swaps this out for the console.
 */
export function AdminLogin() {
  const { user, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Signed in, but not an admin (the layout only renders us in that case).
  if (user) {
    return (
      <Shell>
        <p className="font-semibold">Admins only</p>
        <p className="mt-1 text-sm text-soft">
          <span className="font-medium text-ink">{user.email}</span> isn&apos;t an administrator
          of this community.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => signOut()}>
          Use a different account
        </Button>
      </Shell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setStatus("sending");
    try {
      if (isDemo) {
        await demoSignIn(clean); // AuthProvider picks up the session; layout re-renders.
        return;
      }
      await sendSignInLinkToEmail(auth, clean, {
        url: `${window.location.origin}/auth/admin`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_LINK_KEY, clean);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link.");
      setStatus("idle");
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-clay-soft text-clay-deep">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Higher Ground</h1>
          <p className="text-sm text-soft">Admin console</p>
        </div>
      </div>

      {status === "sent" ? (
        <p className="text-sm text-soft">
          Check <span className="font-semibold text-ink">{email}</span> for a sign-in link, then
          open it to continue.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Admin email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </Field>
          <Button type="submit" loading={status === "sending"} className="w-full">
            {isDemo ? "Enter demo console" : "Send sign-in link"}
          </Button>
          {isDemo && (
            <p className="text-center text-[12px] text-faint">Demo mode — try demo@commonground.app</p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 shadow-card">{children}</div>
    </main>
  );
}
