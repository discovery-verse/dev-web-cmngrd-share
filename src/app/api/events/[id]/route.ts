import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import type { EventBrandingDTO } from "@/lib/api-types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Public, unauthenticated: just enough branding (name + logo + cover) to theme
 * a per-event sign-in page reached via a shareable link, before the visitor
 * has an account. Everything else about an event stays behind /api/admin.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const snap = await adminDb.doc(`events/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  const data = snap.data() ?? {};
  const event: EventBrandingDTO = {
    id: snap.id,
    name: data.name ?? "",
    shortName: data.shortName ?? "",
    logoUrl: data.logoUrl ?? "",
    coverUrl: data.coverUrl ?? "",
    allowSignups: data.allowSignups !== false,
    infoContent: data.infoContent ?? "",
  };
  return NextResponse.json({ event });
}
