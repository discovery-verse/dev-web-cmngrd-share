"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collectionGroup,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { DoorOpen, ExternalLink, EyeOff, LayoutGrid, MapPin, Rows3, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { AwaitingAccess } from "@/components/event-switcher";
import { AttendButton } from "@/components/attend-button";
import type { Room, RoomMessage } from "@/lib/types";
import { cn, groupRoomsByDay, initials, linkHostLabel, roomDayLabel, roomScheduleLabel, shortTime } from "@/lib/utils";
import { CoverBanner, EmptyState, LoadingScreen, PageHeader, ViewToggle } from "@/components/ui";

type ViewMode = "list" | "board";
const VIEW_KEY = "cg-rooms-view";

export default function RoomsLobbyPage() {
  const { currentEvent } = useEvent();
  const { user, member, isAdmin } = useAuth();
  const myUid = user!.uid;
  // Keyed by event id so switching events never flashes the previous lobby.
  const [roomState, setRoomState] = useState<{ eventId: string; rooms: Room[] }>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rsvps, setRsvps] = useState<{ counts: Record<string, number>; mine: Set<string> }>({
    counts: {},
    mine: new Set(),
  });
  const [view, setView] = useState<ViewMode>("list");

  const eventId = currentEvent?.id;

  // Restore the preferred view after hydration (server always renders list).
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "board") void Promise.resolve().then(() => setView("board"));
  }, []);

  function switchView(mode: ViewMode) {
    setView(mode);
    window.localStorage.setItem(VIEW_KEY, mode);
  }

  useEffect(() => {
    if (!eventId) return;
    // Members must filter hidden rooms out — the rules only allow a list the
    // filter makes provably hidden-free. Admins query unfiltered so they can
    // preview staged rooms in place (badged below).
    const q = isAdmin
      ? query(collection(db, "rooms"), where("eventId", "==", eventId))
      : query(
          collection(db, "rooms"),
          where("eventId", "==", eventId),
          where("hidden", "==", false),
        );
    return onSnapshot(q, (snap) => {
      setRoomState({
        eventId,
        // Agenda order first (admin-set, lower = earlier); newest-first breaks
        // ties for rooms without one.
        rooms: snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Room)
          .sort(
            (a, b) =>
              (a.order ?? 0) - (b.order ?? 0) ||
              (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
          ),
      });
    });
  }, [eventId, isAdmin]);

  const rooms = roomState && roomState.eventId === eventId ? roomState.rooms : null;

  // One listener across every room's participants gives live "who's where"
  // counts for the whole lobby.
  useEffect(() => {
    return onSnapshot(collectionGroup(db, "participants"), (snap) => {
      const next: Record<string, number> = {};
      snap.forEach((docSnap) => {
        const roomId = docSnap.ref.parent.parent?.id;
        if (roomId) next[roomId] = (next[roomId] ?? 0) + 1;
      });
      setCounts(next);
    });
  }, []);

  // Same trick for RSVPs — counts per room plus which rooms *I* said I'll
  // attend, from a single snapshot.
  useEffect(() => {
    return onSnapshot(collectionGroup(db, "rsvps"), (snap) => {
      const nextCounts: Record<string, number> = {};
      const mine = new Set<string>();
      snap.forEach((docSnap) => {
        const roomId = docSnap.ref.parent.parent?.id;
        if (!roomId) return;
        nextCounts[roomId] = (nextCounts[roomId] ?? 0) + 1;
        if (docSnap.id === myUid) mine.add(roomId);
      });
      setRsvps({ counts: nextCounts, mine });
    });
  }, [myUid]);

  function toggleAttend(roomId: string) {
    if (!member) return;
    const ref = doc(db, "rooms", roomId, "rsvps", myUid);
    if (rsvps.mine.has(roomId)) {
      deleteDoc(ref).catch(() => {});
    } else {
      setDoc(ref, { name: member.name, createdAt: serverTimestamp() }).catch(() => {});
    }
  }

  if (!currentEvent) {
    return (
      <div>
        <PageHeader title="Rooms" />
        <AwaitingAccess />
      </div>
    );
  }

  // One section per agenda day; skip the lone "Anytime" header when no room
  // has a date yet so an unscheduled lobby renders exactly as before.
  const dayGroups = rooms ? groupRoomsByDay(rooms) : [];
  const showDayHeaders = !(dayGroups.length === 1 && dayGroups[0].date === "");

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle={`Conversations at ${currentEvent.shortName} — hop rooms any time`}
        action={
          <ViewToggle
            value={view}
            onChange={switchView}
            options={[
              { value: "list", label: "List view", icon: <Rows3 className="size-4" aria-hidden /> },
              { value: "board", label: "Board view", icon: <LayoutGrid className="size-4" aria-hidden /> },
            ]}
          />
        }
      />
      {rooms === null ? (
        <LoadingScreen />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="size-8" aria-hidden />}
          title="No rooms open right now"
          body="Rooms appear here when the team opens them — check back during sessions."
        />
      ) : (
        <div className="space-y-5">
          {dayGroups.map(({ date, rooms: dayRooms }) => (
            <section key={date || "anytime"}>
              {showDayHeaders && (
                <h2 className="mb-2 px-4 text-[13px] font-bold uppercase tracking-wide text-faint">
                  {date ? roomDayLabel(date) : "Anytime"}
                </h2>
              )}
              {view === "list" ? (
                <RoomList rooms={dayRooms} rsvps={rsvps} onToggleAttend={toggleAttend} />
              ) : (
                <RoomBoard rooms={dayRooms} counts={counts} rsvps={rsvps} onToggleAttend={toggleAttend} />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Only admins ever receive hidden rooms — badge them so a staged room is
 *  obvious while previewing the lobby. */
function HiddenBadge({ room }: { room: Room }) {
  if (!room.hidden) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-line/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-soft">
      <EyeOff className="size-3" aria-hidden />
      Hidden
    </span>
  );
}

/** Room link as a tappable button. Sits inside the card's <Link>, so it stops
 *  the click from opening the room instead of the URL. */
function RoomLink({ room, className }: { room: Room; className?: string }) {
  if (!room.link) return null;
  return (
    <a
      href={room.link}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-full bg-clay px-4 py-2 text-[13px] font-bold text-white",
        className,
      )}
    >
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{room.linkLabel?.trim() || linkHostLabel(room.link)}</span>
    </a>
  );
}

/** Featured people under a room card ("Samuel Chen · Speaker"). */
function RoomPeople({ room }: { room: Room }) {
  const people = room.people ?? [];
  if (people.length === 0) return null;
  return (
    <p className="mt-0.5 truncate text-[12px] font-semibold text-clay">
      {people.map((p) => (p.role ? `${p.name} · ${p.role}` : p.name)).join(", ")}
    </p>
  );
}

/** Full-width when/where badge on a room card, holding both the time and the
 *  place ("14:45 – 16:15 · 📍 Ballroom") and sized by `locationClass` (the pin
 *  icon and time scale with it). Wide list rows keep them on one line;
 *  `stack` puts the time above the place so narrow board columns don't
 *  truncate the room name. The date is left to the day heading above. */
function RoomWhenWhere({
  room,
  locationClass,
  align = "center",
  stack = false,
}: {
  room: Room;
  locationClass?: string;
  /** Wide list rows read better left-aligned; narrow board columns centered. */
  align?: "left" | "center";
  stack?: boolean;
}) {
  const schedule = roomScheduleLabel(room, { withDate: false, withLocation: false });
  if (!schedule && !room.location) return null;
  return (
    <p
      className={cn(
        "flex w-full min-w-0 gap-x-2 rounded-full bg-clay-soft px-4 font-bold leading-tight text-clay-deep",
        stack ? "flex-col items-center gap-y-0.5 rounded-3xl py-1.5" : "items-center py-1",
        align === "left" ? "justify-start" : "justify-center",
        locationClass,
      )}
    >
      {schedule && <span className="shrink-0 text-[0.8em] font-semibold text-clay">{schedule}</span>}
      {room.location && (
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-[1em] shrink-0" aria-hidden />
          <span className="truncate">{room.location}</span>
        </span>
      )}
    </p>
  );
}

interface RsvpState {
  counts: Record<string, number>;
  mine: Set<string>;
}

function LiveCount({ count }: { count: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1.5 text-[13px] font-bold text-sage">
      <Users className="size-3.5" aria-hidden />
      {count}
      <span className="sr-only">people in this room</span>
    </div>
  );
}

/* ------------------------------- List view -------------------------------- */

function RoomList({
  rooms,
  rsvps,
  onToggleAttend,
}: {
  rooms: Room[];
  rsvps: RsvpState;
  onToggleAttend: (roomId: string) => void;
}) {
  return (
    <ul className="space-y-2.5 px-4">
      {rooms.map((room, i) => (
        <li key={room.id}>
          <Link
            href={`/rooms/${room.id}`}
            className={cn(
              "flex flex-col gap-3 rounded-card p-4 shadow-card active:scale-[0.99]",
              // Alternating fill so where one session ends and the next begins
              // is obvious when cards run long. The tinted row is the page's
              // own cream, so it needs a hairline edge to stay card-shaped.
              i % 2 === 0 ? "bg-surface" : "bg-paper ring-1 ring-inset ring-line",
            )}
          >
            {/* Full-width RSVP on top, then the room, then when/where below. */}
            <AttendButton
              on={rsvps.mine.has(room.id)}
              count={rsvps.counts[room.id] ?? 0}
              onToggle={() => onToggleAttend(room.id)}
              countClass="text-[19px] leading-none sm:text-[22px]"
              invite
              className={cn(
                "w-full justify-center py-2",
                !rsvps.mine.has(room.id) && "attention-shimmer",
              )}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3.5">
              <RoomCover
                room={room}
                className="h-24 w-full rounded-2xl object-contain sm:h-16 sm:w-28 sm:shrink-0"
                initialsClass="text-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="line-clamp-2 text-[19px] font-bold leading-tight sm:text-[22px]">{room.name}</span>
                  <HiddenBadge room={room} />
                </p>
                {room.topic && <p className="truncate text-sm text-soft">{room.topic}</p>}
                <RoomPeople room={room} />
              </div>
            </div>
            <RoomWhenWhere room={room} locationClass="text-[16px] sm:text-[22px]" align="left" />
            <RoomLink room={room} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- Board view -------------------------------- */
/* Padlet-style wall: one column per room with a cover and the latest
   discussion as storyboard cards. Horizontal snap-scroll on mobile. */

function RoomBoard({
  rooms,
  counts,
  rsvps,
  onToggleAttend,
}: {
  rooms: Room[];
  counts: Record<string, number>;
  rsvps: RsvpState;
  onToggleAttend: (roomId: string) => void;
}) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [-webkit-overflow-scrolling:touch]">
      {rooms.map((room) => (
        <RoomColumn
          key={room.id}
          room={room}
          count={counts[room.id] ?? 0}
          attending={rsvps.mine.has(room.id)}
          rsvpCount={rsvps.counts[room.id] ?? 0}
          onToggleAttend={() => onToggleAttend(room.id)}
        />
      ))}
    </div>
  );
}

/** Room cover — the uploaded image, or a gradient with the room's initials.
 *  Sizing/rounding come from `className` so it serves both the board cover and
 *  the list-row thumbnail. */
function RoomCover({
  room,
  className,
  initialsClass = "text-4xl",
}: {
  room: Room;
  className?: string;
  initialsClass?: string;
}) {
  if (room.imageUrl) {
    return (
      // Admin-supplied arbitrary hosts, so next/image (fixed remotePatterns)
      // doesn't fit here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={room.imageUrl}
        alt=""
        loading="lazy"
        className={cn("object-cover", className)}
      />
    );
  }
  return (
    <CoverBanner seed={room.id} className={cn("flex items-center justify-center", className)}>
      <span aria-hidden className={cn("font-bold text-white/90", initialsClass)}>
        {initials(room.name)}
      </span>
    </CoverBanner>
  );
}

function RoomColumn({
  room,
  count,
  attending,
  rsvpCount,
  onToggleAttend,
}: {
  room: Room;
  count: number;
  attending: boolean;
  rsvpCount: number;
  onToggleAttend: () => void;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "rooms", room.id, "messages"),
      orderBy("createdAt", "desc"),
      limit(3),
    );
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoomMessage).reverse(),
      );
    });
  }, [room.id]);

  return (
    <div className="flex w-[300px] shrink-0 snap-start flex-col gap-2">
      <Link
        href={`/rooms/${room.id}`}
        className="rounded-card bg-surface p-2.5 shadow-card active:scale-[0.99]"
      >
        {/* Full-width RSVP above the cover — the first thing a scanner sees. */}
        <AttendButton
          on={attending}
          count={rsvpCount}
          onToggle={onToggleAttend}
          countClass="text-base leading-none"
          invite
          className={cn("mb-2 w-full justify-center py-2", !attending && "attention-shimmer")}
        />
        <RoomCover room={room} className="h-32 w-full rounded-xl" />
        <div className="flex items-start justify-between gap-2 px-1 pb-1 pt-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="truncate font-bold leading-tight">{room.name}</span>
              <HiddenBadge room={room} />
            </p>
            {room.topic && <p className="mt-0.5 line-clamp-5 text-[12px] leading-relaxed text-soft">{room.topic}</p>}
            <RoomPeople room={room} />
          </div>
          <LiveCount count={count} />
        </div>
        <div className="space-y-2 px-1 pb-1">
          <RoomWhenWhere room={room} locationClass="text-base" stack />
          <RoomLink room={room} />
        </div>
      </Link>

      {messages.map((m) => (
        <Link
          key={m.id}
          href={`/rooms/${room.id}`}
          className="rounded-card bg-surface px-3.5 py-2.5 shadow-card"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[12px] font-bold text-clay">{m.senderName}</p>
            <span className="shrink-0 text-[10px] text-faint">{shortTime(m.createdAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-[13px] leading-relaxed text-soft">{m.text}</p>
        </Link>
      ))}

      <Link
        href={`/rooms/${room.id}`}
        className="rounded-full border border-dashed border-line py-2 text-center text-[13px] font-semibold text-soft hover:border-clay hover:text-clay"
      >
        {messages.length === 0 ? "Start the conversation" : "Join the conversation"}
      </Link>
    </div>
  );
}
