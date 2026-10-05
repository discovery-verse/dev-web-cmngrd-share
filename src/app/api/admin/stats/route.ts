import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { StatsDTO } from "@/lib/api-types";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const eventsSnap = await adminDb.collection("events").get();
    const eventIds = eventsSnap.docs.map((d) => d.id);

    const [members, rooms, openReports, ...counts] = await Promise.all([
      adminDb.collection("members").count().get(),
      adminDb.collection("rooms").count().get(),
      adminDb.collection("reports").where("status", "==", "open").count().get(),
      // Per-event member counts, then per-event room counts — same order.
      ...eventIds.map((id) =>
        adminDb.collection("members").where("events", "array-contains", id).count().get(),
      ),
      ...eventIds.map((id) =>
        adminDb.collection("rooms").where("eventId", "==", id).count().get(),
      ),
    ]);

    const perEventCounts = counts.slice(0, eventIds.length);
    const perEventRoomCounts = counts.slice(eventIds.length);
    const perEvent: Record<string, number> = {};
    const perEventRooms: Record<string, number> = {};
    eventIds.forEach((id, i) => {
      perEvent[id] = perEventCounts[i].data().count;
      perEventRooms[id] = perEventRoomCounts[i].data().count;
    });

    const stats: StatsDTO = {
      members: members.data().count,
      rooms: rooms.data().count,
      openReports: openReports.data().count,
      events: eventIds.length,
      perEvent,
      perEventRooms,
    };
    return NextResponse.json({ stats });
  } catch (e) {
    return errorResponse(e);
  }
}
