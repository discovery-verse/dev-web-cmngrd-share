"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { MessagesSquare, Search, UserCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { useMyConnections } from "@/lib/connections";
import { normalizeMember, type Member, type Thread } from "@/lib/types";
import { cn, otherUid, shortTime } from "@/lib/utils";
import { Avatar, EmptyState, LoadingScreen, PageHeader } from "@/components/ui";

export default function MessagesPage() {
  const { user } = useAuth();
  const { currentEvent } = useEvent();
  const myUid = user!.uid;
  const eventId = currentEvent?.id;

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const connections = useMyConnections(myUid);

  useEffect(() => {
    const q = query(
      collection(db, "threads"),
      where("participants", "array-contains", myUid),
      orderBy("lastMessageAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Thread));
    });
  }, [myUid]);

  // Load the community so we can offer a searchable list of people I'm connected
  // with — the members I'm allowed to start a private chat with.
  useEffect(() => {
    if (!eventId) return;
    const q = query(
      collection(db, "members"),
      where("events", "array-contains", eventId),
      orderBy("nameLower"),
    );
    return onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => normalizeMember(d.id, d.data())));
    });
  }, [eventId]);

  // My accepted connections, in the member list's name order.
  const connectedMembers = useMemo(() => {
    return members.filter((m) => connections?.get(m.uid)?.status === "accepted");
  }, [members, connections]);

  // Uids I already have a conversation with — so the connections list below can
  // show only the people I *haven't* messaged yet (the ones already in a thread
  // appear in the Conversations section above, no need to list them twice).
  const threadUids = useMemo(
    () => new Set((threads ?? []).map((t) => otherUid(t.participants, myUid))),
    [threads, myUid],
  );
  const connectionsToStart = useMemo(
    () => connectedMembers.filter((m) => !threadUids.has(m.uid)),
    [connectedMembers, threadUids],
  );

  const term = search.trim().toLowerCase();
  const searching = term.length > 0;
  const matches = useMemo(() => {
    if (!searching) return [];
    return connectedMembers.filter(
      (m) => m.nameLower.includes(term) || m.companyLower.includes(term),
    );
  }, [connectedMembers, searching, term]);

  const nothingYet = threads !== null && threads.length === 0 && connectedMembers.length === 0;

  return (
    <div>
      <PageHeader title="Chats" subtitle="Private one-to-one conversations" />

      {connectedMembers.length > 0 && (
        <div className="sticky top-12 z-30 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your connections to chat"
              aria-label="Search your connections to start a chat"
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-11 pr-4 text-[15px] placeholder:text-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15"
            />
          </div>
        </div>
      )}

      {searching ? (
        matches.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="size-8" aria-hidden />}
            title="No connections match that"
            body="You can chat with anyone you're connected with. Connect with more people in People."
          />
        ) : (
          <ul className="space-y-1.5 px-4 pt-1">
            {matches.map((m) => (
              <ConnectionRow key={m.uid} member={m} />
            ))}
          </ul>
        )
      ) : threads === null ? (
        <LoadingScreen />
      ) : nothingYet ? (
        <EmptyState
          icon={<MessagesSquare className="size-8" aria-hidden />}
          title="No conversations yet"
          body="Connect with someone in People, then say hello — conversations you start will appear here."
        />
      ) : (
        <div className="space-y-5">
          {threads.length > 0 && (
            <section className="space-y-1.5 px-4">
              <SectionLabel>Conversations</SectionLabel>
              <ul className="space-y-1.5">
                {threads.map((t) => {
                  const other = otherUid(t.participants, myUid);
                  const name = t.participantNames?.[other] ?? "Member";
                  const readAt = t.reads?.[myUid];
                  const unread =
                    !!t.lastMessageAt &&
                    t.lastSenderId !== myUid &&
                    (!readAt || readAt.toMillis() < t.lastMessageAt.toMillis());
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/messages/with/${other}`}
                        className="flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-card active:scale-[0.99]"
                      >
                        <Avatar
                          name={name}
                          uid={other}
                          className={cn(unread && "ring-2 ring-clay ring-offset-2 ring-offset-surface")}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={cn("truncate", unread ? "font-bold" : "font-semibold")}>{name}</p>
                            <span className="shrink-0 text-[12px] text-faint">{shortTime(t.lastMessageAt)}</span>
                          </div>
                          <p
                            className={cn(
                              "truncate text-sm",
                              unread ? "font-semibold text-ink" : "text-soft",
                            )}
                          >
                            {t.lastSenderId === myUid ? "You: " : ""}
                            {t.lastMessage}
                          </p>
                        </div>
                        {unread && <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-clay" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {connectionsToStart.length > 0 && (
            <section className="space-y-1.5 px-4">
              <SectionLabel>
                {threads.length > 0 ? "Start a new chat" : "Your connections"}
              </SectionLabel>
              <ul className="space-y-1.5">
                {connectionsToStart.map((m) => (
                  <ConnectionRow key={m.uid} member={m} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Small uppercase section heading between the conversations / connections lists. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-[12px] font-bold uppercase tracking-wide text-faint">{children}</h2>
  );
}

/** A connected member you can tap to open (or start) a private chat with. */
function ConnectionRow({ member }: { member: Member }) {
  return (
    <li>
      <Link
        href={`/messages/with/${member.uid}`}
        className="flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-card active:scale-[0.99]"
      >
        <Avatar name={member.name} uid={member.uid} src={member.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{member.name}</p>
          <p className="truncate text-sm text-soft">
            {member.title}
            {member.title && member.company ? " · " : ""}
            {member.company}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold text-sage">
          <UserCheck className="size-3" aria-hidden />
          Connected
        </span>
      </Link>
    </li>
  );
}
