"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Check, Loader2, Search, SlidersHorizontal, Sparkles, Trophy, UserCheck, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEvent } from "@/lib/event-context";
import { requestConnection, useMyConnections } from "@/lib/connections";
import { AwaitingAccess } from "@/components/event-switcher";
import { normalizeMember, type Connection, type Member, type MemberGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, GroupChip, LoadingScreen, PageHeader, ViewToggle } from "@/components/ui";
import { IncomingRequests } from "@/components/incoming-requests";
import { Leaderboard } from "@/components/leaderboard";

const GROUP_FILTERS: { value: MemberGroup | "all"; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "founder", label: "Founders" },
  { value: "executive", label: "Executives" },
  { value: "nonprofit", label: "Non-profit" },
  { value: "church", label: "Church" },
  { value: "investor", label: "Investors" },
  { value: "corporate", label: "Corporate" },
  { value: "speaker", label: "Speakers" },
  { value: "panelist", label: "Panelists" },
  { value: "startup-pitch", label: "Startup Pitch" },
];

type ConnectionFilter = "all" | "none" | "pending" | "connected";

const CONNECTION_FILTERS: { value: ConnectionFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "none", label: "Not connected" },
  { value: "pending", label: "Pending request" },
  { value: "connected", label: "Connected" },
];

type DirectoryView = "directory" | "leaderboard";
const DIRECTORY_VIEW_KEY = "cg-people-view";

export default function DirectoryPage() {
  const { user, member } = useAuth();
  const { currentEvent } = useEvent();
  // Keyed by event id so switching events never flashes the previous list.
  const [memberState, setMemberState] = useState<{ eventId: string; members: Member[] }>();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<MemberGroup | "all">("all");
  const [connFilter, setConnFilter] = useState<ConnectionFilter>("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [view, setView] = useState<DirectoryView>("directory");

  const eventId = currentEvent?.id;
  const myUid = user?.uid ?? "";
  const connections = useMyConnections(myUid);

  // Restore the preferred view after hydration (server always renders directory).
  useEffect(() => {
    const stored = window.localStorage.getItem(DIRECTORY_VIEW_KEY);
    if (stored === "leaderboard") void Promise.resolve().then(() => setView("leaderboard"));
  }, []);

  function switchView(mode: DirectoryView) {
    setView(mode);
    window.localStorage.setItem(DIRECTORY_VIEW_KEY, mode);
  }

  useEffect(() => {
    if (!eventId) return;
    const q = query(
      collection(db, "members"),
      where("events", "array-contains", eventId),
      orderBy("nameLower"),
    );
    return onSnapshot(q, (snap) => {
      setMemberState({
        eventId,
        members: snap.docs.map((d) => normalizeMember(d.id, d.data())),
      });
    });
  }, [eventId]);

  const members = memberState && memberState.eventId === eventId ? memberState.members : null;

  const filtered = useMemo(() => {
    if (!members) return [];
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      if (group !== "all" && !m.groups.includes(group)) return false;
      if (connFilter !== "all") {
        // Connection-status filters describe a relationship with me, so my own
        // row never matches any of them.
        if (m.uid === myUid) return false;
        const c = connections?.get(m.uid) ?? null;
        const status: ConnectionFilter =
          c === null ? "none" : c.status === "accepted" ? "connected" : "pending";
        if (status !== connFilter) return false;
      }
      if (!term) return true;
      return m.nameLower.includes(term) || m.companyLower.includes(term);
    });
  }, [members, search, group, connFilter, connections, myUid]);

  // Two "you should meet" picks: not yet connected, ranked by how many
  // "best described as" groups they share with me. The tie-break hash is
  // per-viewer (so different members see different faces) but stable (so the
  // picks don't reshuffle on every snapshot). Connecting with a pick removes
  // it from the pool and the next candidate fills in — two at all times while
  // unconnected members remain.
  const recommended = useMemo(() => {
    if (!members || !connections) return [];
    const myGroups = new Set(member?.groups ?? []);
    const sharedCount = (m: Member) => m.groups.filter((g) => myGroups.has(g)).length;
    const jitter = (uid: string) => {
      let h = 0;
      for (const ch of uid + myUid) h = (h * 31 + ch.charCodeAt(0)) | 0;
      return h;
    };
    return members
      .filter((m) => m.uid !== myUid && !connections.get(m.uid))
      .sort((a, b) => sharedCount(b) - sharedCount(a) || jitter(a.uid) - jitter(b.uid))
      .slice(0, 2)
      .map((m) => ({ member: m, shared: m.groups.filter((g) => myGroups.has(g)) }));
  }, [members, connections, member, myUid]);

  if (!currentEvent) {
    return (
      <div>
        <PageHeader title="People" />
        <AwaitingAccess />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={members ? `${members.length} members at ${currentEvent.shortName}` : undefined}
        action={
          <ViewToggle
            value={view}
            onChange={switchView}
            options={[
              { value: "directory", label: "Directory", icon: <Users className="size-4" aria-hidden /> },
              { value: "leaderboard", label: "Leaderboard", icon: <Trophy className="size-4" aria-hidden /> },
            ]}
          />
        }
      />

      <IncomingRequests />

      {view === "leaderboard" ? (
        <Leaderboard eventId={currentEvent.id} members={members} myUid={myUid} />
      ) : (
        <>
      {recommended.length > 0 && (
        <section className="px-4 pb-2 pt-1">
          <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-faint">
            <Sparkles className="size-3.5" aria-hidden />
            Recommended for you
          </h2>
          {/* Same breakpoint as the directory list below — two columns only
              when the cards genuinely have room, else names truncate. */}
          <div className="grid grid-cols-1 gap-2 @3xl:grid-cols-2">
            {recommended.map(({ member: m, shared }) => (
              <Link
                key={m.uid}
                href={`/people/${m.uid}`}
                className="flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-card ring-1 ring-inset ring-clay-soft transition-transform active:scale-[0.99]"
              >
                <Avatar name={m.name} uid={m.uid} src={m.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-sm text-soft">
                    {m.title}
                    {m.title && m.company ? " · " : ""}
                    {m.company}
                  </p>
                  {/* Lead with the groups we share — the reason they're here. */}
                  <GroupChip groups={shared.length ? shared : m.groups} className="mt-1.5" />
                </div>
                <div className="flex shrink-0 items-center">
                  <ConnectionControl connection={null} myUid={myUid} otherUid={m.uid} isSelf={false} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="sticky top-12 z-30 space-y-2.5 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or company"
            aria-label="Search members by name or company"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-11 pr-4 text-[15px] placeholder:text-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
          <button
            onClick={() => setShowMoreFilters((v) => !v)}
            aria-expanded={showMoreFilters}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              showMoreFilters || connFilter !== "all"
                ? "bg-ink text-white"
                : "bg-surface text-soft border border-line hover:border-faint",
            )}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Filters
          </button>
          {GROUP_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setGroup(f.value)}
              aria-pressed={group === f.value}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                group === f.value
                  ? "bg-ink text-white"
                  : "bg-surface text-soft border border-line hover:border-faint",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {showMoreFilters && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
            {CONNECTION_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setConnFilter(f.value)}
                aria-pressed={connFilter === f.value}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  connFilter === f.value
                    ? "bg-clay-soft text-clay-deep"
                    : "bg-surface text-soft border border-line hover:border-faint",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {members === null ? (
        <LoadingScreen label="Loading the community…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" aria-hidden />}
          title="No one matches that"
          body="Try a different name, company, group, or filter."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2 px-4 pt-1 @3xl:grid-cols-2">
          {filtered.map((m) => {
            // `undefined` = connections still loading (hold off the Connect
            // button); `null` = loaded, no connection with this member.
            const connection = connections === null ? undefined : (connections.get(m.uid) ?? null);
            // Give people I'm already connected with a distinct sage border and
            // tint so they stand out at a glance in the directory.
            const connected = connection?.status === "accepted";
            return (
              <li key={m.uid}>
                <Link
                  href={`/people/${m.uid}`}
                  className={cn(
                    "flex items-center gap-3 rounded-card p-3.5 shadow-card transition-transform active:scale-[0.99]",
                    connected ? "bg-sage-soft/40 ring-1 ring-inset ring-sage/40" : "bg-surface",
                  )}
                >
                  <Avatar name={m.name} uid={m.uid} src={m.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {m.name}
                      {m.uid === user?.uid && <span className="ml-1.5 text-[12px] font-medium text-faint">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-soft">
                      {m.title}
                      {m.title && m.company ? " · " : ""}
                      {m.company}
                    </p>
                    <GroupChip groups={m.groups} className="mt-1.5 hidden min-[400px]:inline-flex" />
                  </div>
                  <div className="flex shrink-0 items-center">
                    <ConnectionControl
                      connection={connection}
                      myUid={myUid}
                      otherUid={m.uid}
                      isSelf={m.uid === user?.uid}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
        </>
      )}
    </div>
  );
}

const chip =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";

/**
 * Trailing connection control on each directory row: a neutral "Connect"
 * button when there's no connection yet, or a status pill once there is
 * (green "Connected" for accepted, "Request sent" for my outgoing request,
 * "Wants to connect" for an incoming one). Tapping Connect fires the request
 * inline without navigating into the profile the row links to.
 */
function ConnectionControl({
  connection,
  myUid,
  otherUid,
  isSelf,
}: {
  connection: Connection | null | undefined;
  myUid: string;
  otherUid: string;
  isSelf: boolean;
}) {
  const [busy, setBusy] = useState(false);

  // Never offer to connect with yourself; `undefined` means the connections
  // snapshot hasn't loaded yet — hold off rendering to avoid a flash of "Connect".
  if (isSelf || connection === undefined) return null;

  if (connection === null) {
    return (
      <button
        type="button"
        disabled={busy || !myUid}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy || !myUid) return;
          setBusy(true);
          // The useMyConnections snapshot flips this row to "Request sent"
          // as soon as the write lands, so we just clear the spinner.
          requestConnection(myUid, otherUid)
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
        className={cn(
          chip,
          "border border-line bg-surface text-ink transition-colors hover:border-faint hover:bg-line/30 disabled:opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-3" aria-hidden />
        )}
        Connect
      </button>
    );
  }

  if (connection.status === "accepted") {
    return (
      <span className={cn(chip, "bg-sage text-white")}>
        <UserCheck className="size-3" aria-hidden />
        Connected
      </span>
    );
  }
  if (connection.requestedBy === myUid) {
    return (
      <span className={cn(chip, "bg-clay-soft text-clay-deep")}>
        <Check className="size-3" aria-hidden />
        Request sent
      </span>
    );
  }
  return <span className={cn(chip, "bg-amber-soft text-amber")}>Wants to connect</span>;
}
