import { NextRequest, NextResponse } from "next/server";
import { adminDb, deleteAdminObject } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import {
  cleanDate,
  cleanFiles,
  cleanLink,
  cleanOrder,
  cleanPeople,
  cleanTime,
  isRoomFilePath,
} from "@/lib/server/rooms";
import type { RoomDTO } from "@/lib/api-types";
import type { RoomFile } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const ref = adminDb.doc(`rooms/${id}`);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Room not found.");

    const body = (await req.json()) as Partial<RoomDTO>;
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      if (!body.name.trim()) throw new Error("Room name cannot be empty.");
      update.name = body.name.trim();
    }
    if (typeof body.topic === "string") update.topic = body.topic.trim();
    if (typeof body.imageUrl === "string") update.imageUrl = body.imageUrl.trim();
    if (typeof body.eventId === "string") {
      if (!(await adminDb.doc(`events/${body.eventId}`).get()).exists) {
        throw new Error("That event doesn't exist.");
      }
      update.eventId = body.eventId;
    }
    if (typeof body.date === "string") update.date = cleanDate(body.date);
    if (typeof body.startTime === "string") update.startTime = cleanTime(body.startTime);
    if (typeof body.endTime === "string") update.endTime = cleanTime(body.endTime);
    if (typeof body.location === "string") update.location = body.location.trim().slice(0, 120);
    if (typeof body.link === "string") update.link = cleanLink(body.link);
    if (typeof body.linkLabel === "string") update.linkLabel = body.linkLabel.trim().slice(0, 60);
    if (body.order !== undefined) update.order = cleanOrder(body.order);
    if (typeof body.hidden === "boolean") update.hidden = body.hidden;
    if (Array.isArray(body.people)) update.people = cleanPeople(body.people);

    // Downloads: replace the list, then clean up storage objects the admin
    // removed so they don't accumulate as orphans.
    let removed: RoomFile[] = [];
    if (Array.isArray(body.files)) {
      const files = cleanFiles(body.files);
      update.files = files;
      const keep = new Set(files.map((f) => f.path));
      removed = ((snap.data()?.files ?? []) as RoomFile[]).filter(
        (f) => f.path && !keep.has(f.path) && isRoomFilePath(f.path),
      );
    }

    await ref.update(update);
    await Promise.all(removed.map((f) => deleteAdminObject(f.path).catch(() => {})));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete a room, its subcollections (participants, messages), and its files. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const ref = adminDb.doc(`rooms/${id}`);
    const snap = await ref.get();
    const files = ((snap.data()?.files ?? []) as RoomFile[]).filter(
      (f) => f.path && isRoomFilePath(f.path),
    );
    // recursiveDelete removes participants/ and messages/ too — a plain delete
    // would orphan them.
    await adminDb.recursiveDelete(ref);
    await Promise.all(files.map((f) => deleteAdminObject(f.path).catch(() => {})));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
