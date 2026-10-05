import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { AuthError, errorResponse, requireAuth } from "@/lib/server/auth";
import { MAX_ABOUT, MAX_INTERESTS, MAX_LOCATION, normalizeLinks, SELF_SERVE_GROUPS, type MemberGroup } from "@/lib/types";

interface OnboardingBody {
  name?: string;
  title?: string;
  company?: string;
  /** Public — where the member is based (City / Country / Region). */
  location?: string;
  /** Public free-text self-introduction. */
  about?: string;
  /** Public free-text interests & redemptive burden. */
  interests?: string;
  groups?: string[];
  phone?: string;
  linkedin?: string;
  /** Uploaded profile-photo download URL (bytes already in Cloud Storage). */
  photoUrl?: string;
  /** Uploaded cover-banner download URL. */
  coverUrl?: string;
  /** Member-added website / projects / social links. */
  links?: unknown;
  /** The event the visitor arrived through (from a per-event sign-in link). */
  eventId?: string;
}

const SELF_SERVE = new Set<string>(SELF_SERVE_GROUPS);

/** A download URL is optional; when present it must be a sane-length string. */
function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return undefined;
  return trimmed;
}

/**
 * Self-serve onboarding: creates the brand-new member's public profile +
 * private contact card, server-side. This is the *only* path that creates a
 * self-signed-up profile (firestore.rules block client-side member creation),
 * so the "Allow sign-ups" gate here can't be bypassed.
 *
 * Members an admin has already added skip this entirely — they arrive with a
 * profile from the import path, so the gate never sees them.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, email } = await requireAuth(req);
    const body = (await req.json()) as OnboardingBody;

    const memberRef = adminDb.doc(`members/${uid}`);
    // Idempotent: an existing profile means they're already in — don't re-gate.
    if ((await memberRef.get()).exists) {
      return NextResponse.json({ ok: true, alreadyExists: true });
    }

    const name = (body.name ?? "").trim();
    const title = (body.title ?? "").trim();
    const company = (body.company ?? "").trim();
    const location = (body.location ?? "").trim();
    const about = (body.about ?? "").trim();
    const interests = (body.interests ?? "").trim();
    const groups = (Array.isArray(body.groups) ? body.groups : []).map((g) => g.trim());

    if (!name || name.length > 80) throw new AuthError(400, "A name (max 80 chars) is required.");
    if (title.length > 120) throw new AuthError(400, "Title is too long (max 120).");
    if (company.length > 120) throw new AuthError(400, "Company is too long (max 120).");
    if (location.length > MAX_LOCATION) throw new AuthError(400, "Location is too long.");
    if (about.length > MAX_ABOUT) throw new AuthError(400, "About is too long.");
    if (interests.length > MAX_INTERESTS) throw new AuthError(400, "Interests is too long.");
    if (groups.length === 0) throw new AuthError(400, "Pick at least one group.");
    if (!groups.every((g) => SELF_SERVE.has(g))) throw new AuthError(400, "Invalid group selection.");

    // THE SIGN-UP GATE. A brand-new visitor arriving through an event whose
    // sign-ups are closed can't create a profile — only admin-added members
    // (who already have one, handled above) get in.
    const eventId = (body.eventId ?? "").trim().toLowerCase();
    if (eventId) {
      const eventSnap = await adminDb.doc(`events/${eventId}`).get();
      if (eventSnap.exists && eventSnap.data()?.allowSignups === false) {
        throw new AuthError(
          403,
          "This event is invite-only. Ask an organiser to add you, then sign in again.",
        );
      }
    }

    const photoUrl = cleanUrl(body.photoUrl);
    const coverUrl = cleanUrl(body.coverUrl);
    const links = normalizeLinks(body.links);

    await memberRef.set({
      name,
      title,
      company,
      location,
      about,
      interests,
      groups: [...new Set(groups)] as MemberGroup[],
      nameLower: name.toLowerCase(),
      companyLower: company.toLowerCase(),
      // Only write image pointers when present — keep the doc clean otherwise.
      ...(photoUrl ? { photoUrl } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    await adminDb.doc(`members/${uid}/private/contact`).set({
      email: email ?? "",
      phone: (body.phone ?? "").trim(),
      linkedin: (body.linkedin ?? "").trim(),
      links,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
