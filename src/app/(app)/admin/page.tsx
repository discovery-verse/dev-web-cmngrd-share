"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { DoorOpen, Flag, ShieldCheck, Trash2, Users, UserX } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { normalizeMember, type CommunityEvent, type Member, type Report, type Room } from "@/lib/types";
import { cn, normalizeLink, shortTime } from "@/lib/utils";
import { Avatar, Button, EmptyState, Field, Input, PageHeader } from "@/components/ui";

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const { allEvents, currentEvent } = useEvent();
  const [reports, setReports] = useState<Report[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomTopic, setRoomTopic] = useState("");
  const [roomImage, setRoomImage] = useState("");
  const [roomEventId, setRoomEventId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, "reports"),
      where("status", "==", "open"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report));
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "rooms"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Room));
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "members"), orderBy("nameLower"));
    return onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => normalizeMember(d.id, d.data())));
    });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-8" aria-hidden />}
        title="Admins only"
        body="This area is for community moderators."
      />
    );
  }

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!roomName.trim()) return;
    const cleanImage = normalizeLink(roomImage);
    if (cleanImage === null) {
      setRoomError("That image link doesn't look right — use a full web address.");
      return;
    }
    const targetEvent = roomEventId ?? currentEvent?.id;
    if (!targetEvent) {
      setRoomError("Pick which event this room belongs to.");
      return;
    }
    setRoomError(null);
    setCreating(true);
    try {
      await addDoc(collection(db, "rooms"), {
        eventId: targetEvent,
        name: roomName.trim(),
        topic: roomTopic.trim(),
        imageUrl: cleanImage,
        createdBy: user!.uid,
        createdAt: serverTimestamp(),
      });
      setRoomName("");
      setRoomTopic("");
      setRoomImage("");
    } finally {
      setCreating(false);
    }
  }

  async function removeReportedContent(report: Report) {
    const segments = report.targetPath.split("/");
    if (report.targetType === "member") {
      if (!window.confirm(`Remove this member (${report.excerpt}) from the community?`)) return;
      const uid = segments[1];
      // Ban first (blocks new writes via rules), then remove their profile.
      await setDoc(doc(db, "banned", uid), { bannedAt: serverTimestamp(), by: user!.uid });
      await deleteDoc(doc(db, "members", uid, "private", "contact")).catch(() => {});
      await deleteDoc(doc(db, "members", uid));
    } else if (report.targetType === "message") {
      window.alert(
        "DM conversations are private; review with the parties directly. Resolve the report when done.",
      );
      return;
    } else {
      if (!window.confirm("Delete this content for everyone?")) return;
      await deleteDoc(doc(db, report.targetPath));
    }
    await updateDoc(doc(db, "reports", report.id), { status: "resolved" });
  }

  return (
    <div>
      <PageHeader title="Admin" subtitle="Moderation and room management" />

      <section className="px-4" aria-label="Open reports">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-faint">
          <Flag className="size-3.5" aria-hidden />
          Open reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="py-4 text-sm text-soft">Nothing waiting for review. 🎉</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {reports.map((r) => (
              <li key={r.id} className="rounded-card bg-surface p-4 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold uppercase text-danger">
                    {r.targetType}
                  </span>
                  <span className="text-[12px] text-faint">{shortTime(r.createdAt)}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm">&ldquo;{r.excerpt}&rdquo;</p>
                <p className="mt-1 break-all text-[11px] text-faint">{r.targetPath}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="danger"
                    className="min-h-9 flex-1 text-[13px]"
                    onClick={() => removeReportedContent(r)}
                  >
                    {r.targetType === "member" ? (
                      <>
                        <UserX className="size-4" aria-hidden /> Remove member
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-4" aria-hidden /> Remove content
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-9 flex-1 text-[13px]"
                    onClick={() =>
                      updateDoc(doc(db, "reports", r.id), { status: "resolved" })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 pt-8" aria-label="Members and event access">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-faint">
          <Users className="size-3.5" aria-hidden />
          Members &amp; event access ({members.length})
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-soft">
          Tap an event to approve or remove a member. Members only see the
          people, ideas, and rooms of events they&apos;re approved for.
        </p>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li key={m.uid} className="rounded-card bg-surface p-3.5 shadow-card">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} uid={m.uid} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.name}</p>
                  <p className="truncate text-[12px] text-soft">
                    {m.title}
                    {m.title && m.company ? " · " : ""}
                    {m.company}
                  </p>
                </div>
                {(m.events?.length ?? 0) === 0 && (
                  <span className="shrink-0 rounded-full bg-amber-soft px-2.5 py-1 text-[11px] font-bold text-amber">
                    Awaiting
                  </span>
                )}
              </div>
              {allEvents && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {allEvents.map((e: CommunityEvent) => {
                    const approved = m.events?.includes(e.id) ?? false;
                    return (
                      <button
                        key={e.id}
                        onClick={() =>
                          updateDoc(doc(db, "members", m.uid), {
                            events: approved ? arrayRemove(e.id) : arrayUnion(e.id),
                          })
                        }
                        aria-pressed={approved}
                        aria-label={`${approved ? "Remove" : "Approve"} ${m.name} ${approved ? "from" : "for"} ${e.name}`}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                          approved
                            ? "bg-sage-soft text-sage"
                            : "border border-dashed border-line text-faint hover:border-faint hover:text-soft",
                        )}
                      >
                        {approved ? "✓ " : "+ "}
                        {e.shortName}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="px-4 pt-8" aria-label="Rooms">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-faint">
          <DoorOpen className="size-3.5" aria-hidden />
          Rooms
        </h2>
        <form onSubmit={createRoom} className="mt-3 space-y-3 rounded-card bg-surface p-4 shadow-card">
          {allEvents && allEvents.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allEvents.map((e) => {
                const selected = (roomEventId ?? currentEvent?.id) === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setRoomEventId(e.id)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold",
                      selected
                        ? "bg-clay-soft text-clay-deep"
                        : "border border-line bg-surface text-soft",
                    )}
                  >
                    {e.shortName}
                  </button>
                );
              })}
            </div>
          )}
          <Field label="Room name">
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Founders × Funders"
              required
            />
          </Field>
          <Field label="Topic (optional)">
            <Input
              value={roomTopic}
              onChange={(e) => setRoomTopic(e.target.value)}
              placeholder="What's this room about?"
            />
          </Field>
          <Field label="Cover image URL (optional)">
            <Input
              value={roomImage}
              onChange={(e) => setRoomImage(e.target.value)}
              inputMode="url"
              placeholder="example.com/photo.jpg — shown in board view"
            />
          </Field>
          <Button type="submit" loading={creating} className="w-full">
            Open room
          </Button>
          {roomError && <p className="text-sm text-danger">{roomError}</p>}
        </form>
        <ul className="mt-3 space-y-2 pb-8">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex items-center justify-between gap-3 rounded-card bg-surface p-3.5 shadow-card"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{room.name}</p>
                {room.topic && <p className="truncate text-[13px] text-soft">{room.topic}</p>}
              </div>
              <button
                onClick={async () => {
                  if (window.confirm(`Close and delete "${room.name}"?`)) {
                    await deleteDoc(doc(db, "rooms", room.id));
                  }
                }}
                aria-label={`Close ${room.name}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-faint hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
