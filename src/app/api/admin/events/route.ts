import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { normalizeLink } from "@/lib/utils";
import type { EventDTO } from "@/lib/api-types";

const ID_RE = /^[a-z0-9-]{2,24}$/;

function toDTO(id: string, data: FirebaseFirestore.DocumentData): EventDTO {
  return {
    id,
    name: data.name ?? "",
    shortName: data.shortName ?? "",
    order: data.order ?? 0,
    eventUrl: data.eventUrl ?? "",
    signupUrl: data.signupUrl ?? "",
    logoUrl: data.logoUrl ?? "",
    coverUrl: data.coverUrl ?? "",
    dmRequiresConnection: data.dmRequiresConnection === true,
    // Default-on: only an explicit `false` closes sign-ups.
    allowSignups: data.allowSignups !== false,
    infoContent: data.infoContent ?? "",
  };
}

/** Validate an optional link field; blank is fine, garbage is not. */
function parseOptionalLink(raw: string | undefined, label: string): string {
  const normalized = normalizeLink(raw ?? "");
  if (normalized === null) throw new Error(`${label} doesn't look like a valid URL.`);
  return normalized;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const snap = await adminDb.collection("events").get();
    const events: EventDTO[] = snap.docs
      .map((d) => toDTO(d.id, d.data()))
      .sort((a, b) => a.order - b.order);
    return NextResponse.json({ events });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as Partial<EventDTO>;
    const id = (body.id ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim();
    const shortName = (body.shortName ?? "").trim();
    const order = Number(body.order ?? 0);
    const eventUrl = parseOptionalLink(body.eventUrl, "Event link");
    const signupUrl = parseOptionalLink(body.signupUrl, "Sign up link");
    const logoUrl = (body.logoUrl ?? "").trim();
    const coverUrl = (body.coverUrl ?? "").trim();
    const dmRequiresConnection = body.dmRequiresConnection === true;
    const allowSignups = body.allowSignups !== false;
    const infoContent = (body.infoContent ?? "").toString();

    if (!ID_RE.test(id)) {
      throw new Error("Event id must be 2–24 chars: lowercase letters, numbers, hyphens.");
    }
    if (!name) throw new Error("Event name is required.");
    if (!shortName) throw new Error("Short name is required.");

    const ref = adminDb.doc(`events/${id}`);
    if ((await ref.get()).exists) throw new Error(`An event with id "${id}" already exists.`);

    const fields = { name, shortName, order, eventUrl, signupUrl, logoUrl, coverUrl, dmRequiresConnection, allowSignups, infoContent };
    await ref.set(fields);
    return NextResponse.json({ event: { id, ...fields } });
  } catch (e) {
    return errorResponse(e);
  }
}
