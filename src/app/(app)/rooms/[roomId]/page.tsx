"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ArrowLeft, CalendarCheck, ChevronDown, ExternalLink, FileDown, Flag, SendHorizontal, Trash2, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { AttendButton } from "@/components/attend-button";
import { submitReport } from "@/lib/moderation";
import type { Room, RoomMessage } from "@/lib/types";
import { cn, formatBytes, linkHostLabel, messageTime, roomScheduleLabel } from "@/lib/utils";
import { Avatar, LoadingScreen } from "@/components/ui";

interface Participant {
  uid: string;
  name: string;
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user, member, isAdmin } = useAuth();
  const myUid = user!.uid;

  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  // Profile photos for the featured speakers, keyed by uid — RoomPerson only
  // stores name/role, so we look up members/{uid} to show real faces.
  const [speakerPhotos, setSpeakerPhotos] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, "rooms", roomId),
      (snap) => {
        setRoom(snap.exists() ? ({ id: snap.id, ...snap.data() } as Room) : null);
      },
      // Hidden (staged) and deleted rooms deny the read outright — the rules
      // gate on resource.data — so a permission error means "not open to you".
      () => setRoom(null),
    );
  }, [roomId]);

  // Stable dep: only refetch photos when the set of speaker uids actually
  // changes, not on every room snapshot (the people array is a new ref each time).
  const speakerKey = (room?.people ?? []).map((p) => p.uid).join(",");
  useEffect(() => {
    const uids = speakerKey ? speakerKey.split(",") : [];
    if (uids.length === 0) return;
    let cancelled = false;
    Promise.all(
      uids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, "members", uid));
          const url = snap.exists() ? (snap.data().photoUrl as string | undefined) : undefined;
          return [uid, url] as const;
        } catch {
          return [uid, undefined] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [uid, url] of entries) if (url) next[uid] = url;
      setSpeakerPhotos(next);
    });
    return () => {
      cancelled = true;
    };
  }, [speakerKey]);

  // Presence: joining the page writes my participant doc; leaving removes it.
  // One-tap hopping is just navigation — cleanup runs automatically.
  useEffect(() => {
    if (!member) return;
    const ref = doc(db, "rooms", roomId, "participants", myUid);
    setDoc(ref, { name: member.name, joinedAt: serverTimestamp() }).catch(() => {});
    return () => {
      deleteDoc(ref).catch(() => {});
    };
  }, [roomId, myUid, member]);

  useEffect(() => {
    const q = query(collection(db, "rooms", roomId, "participants"), orderBy("joinedAt", "asc"));
    return onSnapshot(q, (snap) => {
      setParticipants(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as Participant));
    });
  }, [roomId]);

  // RSVPs ("I'll be attending") — separate from presence: presence is who's
  // here right now, RSVPs are who plans to come.
  const [rsvps, setRsvps] = useState<Participant[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, "rooms", roomId, "rsvps"), (snap) => {
      setRsvps(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as Participant));
    });
  }, [roomId]);
  const attending = rsvps.some((r) => r.uid === myUid);
  const [showRsvps, setShowRsvps] = useState(false);

  function toggleAttend() {
    if (!member) return;
    const ref = doc(db, "rooms", roomId, "rsvps", myUid);
    if (attending) {
      deleteDoc(ref).catch(() => {});
    } else {
      setDoc(ref, { name: member.name, createdAt: serverTimestamp() }).catch(() => {});
    }
  }

  useEffect(() => {
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(200),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoomMessage));
    });
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !member) return;
    setDraft("");
    try {
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        senderId: myUid,
        senderName: member.name,
        text,
        createdAt: serverTimestamp(),
      });
    } catch {
      setDraft(text);
    }
  }

  if (room === undefined) return <LoadingScreen />;
  if (room === null) {
    return (
      <div className="px-6 py-16 text-center text-soft">
        <p>This room has closed.</p>
        <Link href="/rooms" className="mt-2 inline-block font-semibold text-clay">
          Back to the lobby
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            onClick={() => router.push("/rooms")}
            aria-label="Back to lobby"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-soft hover:bg-line/50"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{room.name}</p>
            {room.topic && <p className="truncate text-[12px] text-soft">{room.topic}</p>}
            {roomScheduleLabel(room) && (
              <p className="truncate text-[11px] text-faint">{roomScheduleLabel(room)}</p>
            )}
          </div>
          <AttendButton on={attending} count={rsvps.length} onToggle={toggleAttend} />
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1.5 text-[13px] font-bold text-sage">
            <Users className="size-3.5" aria-hidden />
            {participants.length}
          </span>
        </div>
        {rsvps.length > 0 && (
          <>
            <button
              onClick={() => setShowRsvps((v) => !v)}
              aria-expanded={showRsvps}
              className="flex items-center gap-1 px-4 pb-2 text-[12px] font-semibold text-clay"
            >
              <CalendarCheck className="size-3.5" aria-hidden />
              {rsvps.length} attending
              <ChevronDown
                className={cn("size-3.5 transition-transform", showRsvps && "rotate-180")}
                aria-hidden
              />
            </button>
            {showRsvps && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
                {[...rsvps]
                  .sort((a, b) =>
                    a.uid === myUid ? -1 : b.uid === myUid ? 1 : a.name.localeCompare(b.name),
                  )
                  .map((r) => (
                    <Link
                      key={r.uid}
                      href={`/people/${r.uid}`}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-soft hover:border-clay hover:text-clay"
                    >
                      {r.uid === myUid ? "You" : r.name}
                    </Link>
                  ))}
              </div>
            )}
          </>
        )}
        {(room.people?.length ?? 0) > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 pt-0.5 [scrollbar-width:none]">
            {room.people!.map((p) => (
              <Link
                key={p.uid}
                href={`/people/${p.uid}`}
                className="flex shrink-0 items-center gap-2 rounded-2xl border border-clay/25 bg-clay-soft py-1.5 pl-1.5 pr-3.5 text-clay-deep shadow-card"
              >
                <Avatar name={p.name} uid={p.uid} src={speakerPhotos[p.uid]} size="sm" className="!size-10" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] font-bold">{p.name}</span>
                  {p.role && (
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-clay">
                      {p.role}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
        {room.link && (
          <div className="px-3 pb-2">
            <a
              href={room.link}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center gap-1.5 rounded-full bg-clay px-4 py-2 text-[13px] font-bold text-white"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{room.linkLabel?.trim() || linkHostLabel(room.link)}</span>
            </a>
          </div>
        )}
        {(room.files?.length ?? 0) > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {room.files!.map((f) => (
              <a
                key={f.path || f.url}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                download={f.name}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-soft hover:border-clay hover:text-clay"
              >
                <FileDown className="size-3.5 text-clay" aria-hidden />
                {f.name}
                {f.size > 0 && <span className="font-normal text-faint">{formatBytes(f.size)}</span>}
              </a>
            ))}
          </div>
        )}
        {participants.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
            {participants.map((p) => (
              <Link
                key={p.uid}
                href={`/people/${p.uid}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-[12px] font-semibold text-soft"
              >
                <Avatar name={p.name} uid={p.uid} size="sm" className="!size-5 !text-[9px]" />
                {p.uid === myUid ? "You" : p.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {room.imageUrl && (
          // Admin-supplied arbitrary host, so next/image (fixed remotePatterns)
          // doesn't fit here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.imageUrl}
            alt=""
            loading="lazy"
            className="mb-3 h-48 w-full rounded-2xl object-cover"
          />
        )}
        {messages === null ? (
          <LoadingScreen />
        ) : messages.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-soft">
            You&apos;re in. Start the discussion — everyone in the room can read and reply.
          </p>
        ) : (
          messages.map((m, i) => {
            const mine = m.senderId === myUid;
            const prev = messages[i - 1];
            const newSender = !prev || prev.senderId !== m.senderId;
            return (
              <div
                key={m.id}
                className={cn("flex gap-2", mine ? "justify-end" : "justify-start", newSender && "pt-2")}
              >
                {!mine && (
                  <span className="w-7 shrink-0">
                    {newSender && (
                      <Avatar name={m.senderName} uid={m.senderId} size="sm" className="!size-7 !text-[10px]" />
                    )}
                  </span>
                )}
                <div
                  className={cn(
                    "group max-w-[78%] @3xl:max-w-xl rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
                    mine ? "rounded-br-md bg-clay text-white" : "rounded-bl-md bg-surface shadow-card",
                  )}
                >
                  {!mine && newSender && (
                    <p className="text-[12px] font-bold text-clay">{m.senderName}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <div className="mt-0.5 flex items-center justify-end gap-2">
                    {!mine && (
                      <button
                        onClick={() =>
                          submitReport({
                            targetType: "room-message",
                            targetPath: `rooms/${roomId}/messages/${m.id}`,
                            excerpt: m.text,
                            reporterId: myUid,
                          })
                        }
                        aria-label="Report message"
                        className="text-faint opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <Flag className="size-3" aria-hidden />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => deleteDoc(doc(db, "rooms", roomId, "messages", m.id))}
                        aria-label="Delete message"
                        className="text-faint opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </button>
                    )}
                    <span className={cn("text-[10px]", mine ? "text-white/70" : "text-faint")}>
                      {messageTime(m.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          placeholder={`Message ${room.name}…`}
          aria-label="Message the room"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-paper px-4 py-2.5 text-[15px] focus:border-clay focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-clay text-white disabled:bg-clay/30"
        >
          <SendHorizontal className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
