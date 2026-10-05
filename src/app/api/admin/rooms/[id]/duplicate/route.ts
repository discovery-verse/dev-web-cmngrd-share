import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, copyAdminObject } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { isRoomFilePath } from "@/lib/server/rooms";
import type { RoomFile } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Duplicate a room's setup (schedule, people, cover, downloads) into a new
 * room. Conversation state — messages, participants, RSVPs — is NOT copied.
 * The copy starts hidden so the admin can reveal it when they're ready.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAdmin(req);
    const { id } = await ctx.params;
    const snap = await adminDb.doc(`rooms/${id}`).get();
    if (!snap.exists) throw new Error("Room not found.");
    const data = snap.data()!;

    // Each download gets its own storage object: the rooms DELETE/PATCH routes
    // remove a room's file objects, so a shared object would leave the other
    // room with dead links.
    const files: RoomFile[] = [];
    for (const f of (data.files ?? []) as RoomFile[]) {
      if (f.path && isRoomFilePath(f.path)) {
        const copied = await copyAdminObject(f.path);
        if (copied) files.push({ ...f, url: copied.url, path: copied.path });
      } else if (f.url) {
        files.push(f);
      }
    }

    const ref = await adminDb.collection("rooms").add({
      eventId: data.eventId ?? "",
      name: `${data.name ?? "Room"} (copy)`,
      topic: data.topic ?? "",
      imageUrl: data.imageUrl ?? "",
      date: data.date ?? "",
      startTime: data.startTime ?? "",
      endTime: data.endTime ?? "",
      location: data.location ?? "",
      link: data.link ?? "",
      linkLabel: data.linkLabel ?? "",
      order: data.order ?? 0,
      hidden: true,
      people: data.people ?? [],
      files,
      createdBy: session.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (e) {
    return errorResponse(e);
  }
}
