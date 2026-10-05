"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { ArrowLeft, Flag, SendHorizontal } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { useConnection } from "@/lib/connections";
import { submitReport } from "@/lib/moderation";
import { normalizeMember, type Member, type Message } from "@/lib/types";
import { cn, messageTime, pairId } from "@/lib/utils";
import { Avatar, LoadingScreen } from "@/components/ui";

export default function ConversationPage() {
  const { uid: otherId } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, member: me } = useAuth();
  const { currentEvent } = useEvent();
  const myUid = user!.uid;
  const threadId = pairId(myUid, otherId);

  const [other, setOther] = useState<Member | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [threadExists, setThreadExists] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const connection = useConnection(myUid, otherId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const dmLocked =
    (currentEvent?.dmRequiresConnection ?? false) &&
    connection !== undefined &&
    connection?.status !== "accepted";

  useEffect(() => {
    return onSnapshot(doc(db, "members", otherId), (snap) => {
      setOther(snap.exists() ? normalizeMember(snap.id, snap.data()) : null);
    });
  }, [otherId]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "threads", threadId),
      (snap) => setThreadExists(snap.exists()),
      () => setThreadExists(false),
    );
  }, [threadId]);

  useEffect(() => {
    const q = query(
      collection(db, "threads", threadId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(200),
    );
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)),
      () => setMessages([]),
    );
  }, [threadId]);

  // Mark the thread read whenever new messages arrive while it's open.
  useEffect(() => {
    if (!threadExists || !messages?.length) return;
    const last = messages[messages.length - 1];
    if (last.senderId === myUid) return;
    updateDoc(doc(db, "threads", threadId), {
      [`reads.${myUid}`]: serverTimestamp(),
    }).catch(() => {});
  }, [messages, threadExists, threadId, myUid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !me || !other) return;
    setDraft("");
    setSendError(null);
    try {
      const batch = writeBatch(db);
      const threadRef = doc(db, "threads", threadId);
      batch.set(
        threadRef,
        {
          participants: threadId.split("_"),
          participantNames: { [myUid]: me.name, [other.uid]: other.name },
          lastMessage: text.slice(0, 120),
          lastSenderId: myUid,
          lastMessageAt: serverTimestamp(),
        },
        { merge: true },
      );
      batch.set(doc(collection(threadRef, "messages")), {
        senderId: myUid,
        text,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      setDraft(text);
      setSendError("Message didn't send — check your connection and try again.");
    }
  }

  if (other === undefined) return <LoadingScreen />;
  if (other === null) {
    return (
      <div className="px-6 py-16 text-center text-soft">
        This member is no longer part of the community.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-paper/95 px-2 py-2 backdrop-blur">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-full text-soft hover:bg-line/50"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <Link href={`/people/${other.uid}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={other.name} uid={other.uid} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{other.name}</p>
            <p className="truncate text-[12px] text-soft">
              {other.title}
              {other.title && other.company ? " · " : ""}
              {other.company}
            </p>
          </div>
        </Link>
        {threadExists && (
          <button
            aria-label="Report this conversation"
            onClick={() =>
              submitReport({
                targetType: "message",
                targetPath: `threads/${threadId}`,
                excerpt: `Conversation with ${other.name}`,
                reporterId: myUid,
              })
            }
            className="flex size-10 items-center justify-center rounded-full text-faint hover:text-danger"
          >
            <Flag className="size-4" aria-hidden />
          </button>
        )}
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {messages === null ? (
          <LoadingScreen />
        ) : messages.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-soft">
            Say hello to {other.name.split(" ")[0]} — this conversation is just between the two of
            you.
          </p>
        ) : (
          messages.map((m, i) => {
            const mine = m.senderId === myUid;
            const prev = messages[i - 1];
            const newSender = !prev || prev.senderId !== m.senderId;
            return (
              <div
                key={m.id}
                className={cn("flex", mine ? "justify-end" : "justify-start", newSender && "pt-2")}
              >
                <div
                  className={cn(
                    "max-w-[80%] @3xl:max-w-xl rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed",
                    mine
                      ? "rounded-br-md bg-clay text-white"
                      : "rounded-bl-md bg-surface text-ink shadow-card",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-right text-[10px]",
                      mine ? "text-white/70" : "text-faint",
                    )}
                  >
                    {messageTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {dmLocked ? (
        <p className="border-t border-line bg-surface px-6 py-4 text-center text-sm text-soft">
          Messaging is limited to accepted connections. Send{" "}
          <Link href={`/people/${other.uid}`} className="font-semibold text-clay">
            {other.name.split(" ")[0]} a connection request
          </Link>{" "}
          to start chatting.
        </p>
      ) : (
        <form
          onSubmit={handleSend}
          className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            placeholder={`Message ${other.name.split(" ")[0]}…`}
            aria-label="Message"
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
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-clay text-white transition-colors disabled:bg-clay/30"
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </form>
      )}
      {sendError && (
        <p className="bg-danger-soft px-4 py-2 text-center text-[13px] text-danger">{sendError}</p>
      )}
    </div>
  );
}
