"use client";

import { sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";
import { auth, AUTH_EMULATOR_URL, DEMO_PROJECT_ID } from "@/lib/firebase";

export const DEMO_EMAIL = "demo@commonground.app";

/**
 * Demo-mode sign-in: runs the real magic-link flow, but instead of waiting
 * for an email, pulls the out-of-band link straight from the Auth emulator's
 * REST endpoint and completes it. Same code path a real user's click takes.
 */
export async function demoSignIn(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/auth/complete`,
    handleCodeInApp: true,
  });
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${DEMO_PROJECT_ID}/oobCodes`,
  );
  if (!res.ok) throw new Error("Auth emulator not reachable");
  const { oobCodes } = (await res.json()) as {
    oobCodes: { email: string; requestType: string; oobLink: string }[];
  };
  const code = [...oobCodes]
    .reverse()
    .find((c) => c.email === email && c.requestType === "EMAIL_SIGNIN");
  if (!code) throw new Error("No sign-in link found in the emulator");
  await signInWithEmailLink(auth, email, code.oobLink);
}
