import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, toMillis } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { cleanDate, cleanFiles, cleanLink, cleanOrder, cleanPeople, cleanTime } from "@/lib/server/rooms";
import type { RoomDTO } from "@/lib/api-types";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const eventId = req.nextUrl.searchParams.get("eventId");
    const snap = eventId
      ? await adminDb.collection("rooms").where("eventId", "==", eventId).get()
      : await adminDb.collection("rooms").get();

    // One collection-group read covers every room's RSVPs.
    const rsvpSnap = await adminDb.collectionGroup("rsvps").get();
    const rsvpsByRoom: Record<string, { uid: string; name: string }[]> = {};
    for (const d of rsvpSnap.docs) {
      const roomId = d.ref.parent.parent?.id;
      if (!roomId) continue;
      (rsvpsByRoom[roomId] ??= []).push({ uid: d.id, name: d.data().name ?? "" });
    }

    const rooms: RoomDTO[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          eventId: data.eventId ?? "",
          name: data.name ?? "",
          topic: data.topic ?? "",
          imageUrl: data.imageUrl ?? "",
          date: data.date ?? "",
          startTime: data.startTime ?? "",
          endTime: data.endTime ?? "",
          location: data.location ?? "",
          link: data.link ?? "",
          linkLabel: data.linkLabel ?? "",
          order: data.order ?? 0,
          hidden: data.hidden === true,
          people: data.people ?? [],
          files: data.files ?? [],
          rsvps: rsvpsByRoom[d.id] ?? [],
          createdBy: data.createdBy ?? "",
          createdAt: toMillis(data.createdAt),
        };
      })
      .sort((a, b) => a.order - b.order || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ rooms });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin(req);
    const body = (await req.json()) as Partial<RoomDTO>;
    const eventId = (body.eventId ?? "").trim();
    const name = (body.name ?? "").trim();
    if (!eventId) throw new Error("Pick which event this room belongs to.");
    if (!name) throw new Error("Room name is required.");
    if (!(await adminDb.doc(`events/${eventId}`).get()).exists) {
      throw new Error("That event doesn't exist.");
    }

    const ref = await adminDb.collection("rooms").add({
      eventId,
      name,
      topic: (body.topic ?? "").trim(),
      imageUrl: (body.imageUrl ?? "").trim(),
      date: cleanDate(body.date),
      startTime: cleanTime(body.startTime),
      endTime: cleanTime(body.endTime),
      location: (body.location ?? "").trim().slice(0, 120),
      link: cleanLink(body.link),
      linkLabel: (body.linkLabel ?? "").trim().slice(0, 60),
      order: cleanOrder(body.order),
      hidden: body.hidden === true,
      people: cleanPeople(body.people),
      files: cleanFiles(body.files),
      createdBy: session.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (e) {
    return errorResponse(e);
  }
}
