import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { normalizeLink } from "@/lib/utils";
import type { EventDTO } from "@/lib/api-types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const ref = adminDb.doc(`events/${id}`);
    if (!(await ref.get()).exists) throw new Error("Event not found.");

    const body = (await req.json()) as Partial<EventDTO>;
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") update.name = body.name.trim();
    if (typeof body.shortName === "string") update.shortName = body.shortName.trim();
    if (body.order !== undefined) update.order = Number(body.order);
    if (typeof body.eventUrl === "string") {
      const normalized = normalizeLink(body.eventUrl);
      if (normalized === null) throw new Error("Event link doesn't look like a valid URL.");
      update.eventUrl = normalized;
    }
    if (typeof body.signupUrl === "string") {
      const normalized = normalizeLink(body.signupUrl);
      if (normalized === null) throw new Error("Sign up link doesn't look like a valid URL.");
      update.signupUrl = normalized;
    }
    if (typeof body.logoUrl === "string") update.logoUrl = body.logoUrl.trim();
    if (typeof body.coverUrl === "string") update.coverUrl = body.coverUrl.trim();
    if (typeof body.dmRequiresConnection === "boolean") update.dmRequiresConnection = body.dmRequiresConnection;
    if (typeof body.allowSignups === "boolean") update.allowSignups = body.allowSignups;
    if (typeof body.infoContent === "string") update.infoContent = body.infoContent;
    if (update.name === "") throw new Error("Event name cannot be empty.");

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Delete an event. Refuses (409) if rooms or posts still reference it (they'd be
 * orphaned). `?force=1` additionally strips the id from every member's `events`
 * array — but still refuses while rooms/posts remain.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const force = req.nextUrl.searchParams.get("force") === "1";

    const [rooms, posts, members] = await Promise.all([
      adminDb.collection("rooms").where("eventId", "==", id).count().get(),
      adminDb.collection("posts").where("eventId", "==", id).count().get(),
      adminDb.collection("members").where("events", "array-contains", id).count().get(),
    ]);
    const roomCount = rooms.data().count;
    const postCount = posts.data().count;
    const memberCount = members.data().count;

    if (roomCount > 0 || postCount > 0) {
      return NextResponse.json(
        {
          error: "Event still has content. Move or delete it first.",
          references: { rooms: roomCount, posts: postCount, members: memberCount },
        },
        { status: 409 },
      );
    }

    if (memberCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `${memberCount} member(s) are still approved for this event.`,
          references: { rooms: 0, posts: 0, members: memberCount },
        },
        { status: 409 },
      );
    }

    if (force && memberCount > 0) {
      const approved = await adminDb
        .collection("members")
        .where("events", "array-contains", id)
        .get();
      const batch = adminDb.batch();
      approved.docs.forEach((d) => batch.update(d.ref, { events: FieldValue.arrayRemove(id) }));
      await batch.commit();
    }

    await adminDb.doc(`events/${id}`).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
