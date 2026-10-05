"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Heart, HeartHandshake, Lightbulb, MessageCircle, Trophy, type LucideIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import type { Member, Post } from "@/lib/types";
import {
  computeLeaderboards,
  findRank,
  LEADERBOARD_METRICS,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from "@/lib/leaderboard";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, LoadingScreen } from "@/components/ui";

const METRIC_ICONS: Record<LeaderboardMetric, LucideIcon> = {
  loved: Heart,
  supportive: HeartHandshake,
  contributor: Lightbulb,
  discussed: MessageCircle,
};

/** Gold / silver / bronze medallions for the top three. */
const MEDALS = ["bg-amber-soft text-amber", "bg-slate-soft text-slate", "bg-clay-soft text-clay-deep"];

type MetricMeta = (typeof LEADERBOARD_METRICS)[number];

/**
 * Event-scoped leaderboards, tallied client-side from the event's posts. Owns
 * its own posts listener; it's mounted only while the leaderboard view is
 * active, so the People landing page carries no always-on posts subscription.
 */
export function Leaderboard({
  eventId,
  members,
  myUid,
}: {
  eventId: string;
  members: Member[] | null;
  myUid: string;
}) {
  // Keyed by event id so switching events never flashes the previous board.
  const [postState, setPostState] = useState<{ eventId: string; posts: Post[] }>();
  const [metric, setMetric] = useState<LeaderboardMetric>("loved");

  useEffect(() => {
    const q = query(collection(db, "posts"), where("eventId", "==", eventId));
    return onSnapshot(q, (snap) => {
      setPostState({
        eventId,
        posts: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post),
      });
    });
  }, [eventId]);

  const posts = postState && postState.eventId === eventId ? postState.posts : null;

  // Recompute all four boards only when the underlying data changes — switching
  // the metric just re-indexes this record.
  const boards = useMemo(
    () => computeLeaderboards(posts ?? [], members ?? []),
    [posts, members],
  );

  if (posts === null || members === null) {
    return <LoadingScreen label="Tallying the leaderboard…" />;
  }

  const meta = LEADERBOARD_METRICS.find((m) => m.value === metric)!;

  return (
    <div>
      <div className="sticky top-12 z-30 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
          {LEADERBOARD_METRICS.map((m) => {
            const Icon = METRIC_ICONS[m.value];
            const active = metric === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                aria-pressed={active}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-clay-soft text-clay-deep"
                    : "border border-line bg-surface text-soft hover:border-faint",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <LeaderboardBody entries={boards[metric]} meta={meta} myUid={myUid} />
    </div>
  );
}

function LeaderboardBody({
  entries,
  meta,
  myUid,
}: {
  entries: LeaderboardEntry[];
  meta: MetricMeta;
  myUid: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Trophy className="size-8" aria-hidden />}
        title="No activity yet"
        body="Reactions, posts, and comments will build the leaderboard."
      />
    );
  }

  const top = entries.slice(0, 3);
  const rest = entries.slice(3);
  const myRank = findRank(entries, myUid);

  return (
    <div className="px-4 pt-1">
      <ul className="space-y-2">
        {top.map((entry, i) => (
          <PodiumRow key={entry.uid} entry={entry} rank={i + 1} unit={meta.unit} isMe={entry.uid === myUid} />
        ))}
      </ul>
      {rest.length > 0 && (
        <ul className="mt-2 space-y-2">
          {rest.map((entry, i) => (
            <RankRow key={entry.uid} entry={entry} rank={i + 4} unit={meta.unit} isMe={entry.uid === myUid} />
          ))}
        </ul>
      )}
      <p className="px-1 py-4 text-center text-[13px] text-soft">
        {myRank
          ? `You're #${myRank} in ${meta.short}.`
          : "You're not on this board yet — react to posts and share ideas to climb."}
      </p>
    </div>
  );
}

function ScoreBadge({ score, unit }: { score: number; unit: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-clay-soft px-3 py-1.5 text-[13px] font-bold text-clay-deep">
      {score}
      <span className="sr-only">{unit}</span>
    </span>
  );
}

function NameLine({ name, isMe, bold }: { name: string; isMe: boolean; bold?: boolean }) {
  return (
    <p className={cn("truncate", bold ? "font-bold" : "font-semibold")}>
      {name}
      {isMe && <span className="ml-1.5 text-[12px] font-medium text-faint">(you)</span>}
    </p>
  );
}

/** Ranks 1–3: medallion + large avatar. */
function PodiumRow({
  entry,
  rank,
  unit,
  isMe,
}: {
  entry: LeaderboardEntry;
  rank: number;
  unit: string;
  isMe: boolean;
}) {
  return (
    <li>
      <Link
        href={`/people/${entry.uid}`}
        className={cn(
          "flex items-center gap-3.5 rounded-card p-3.5 shadow-card transition-transform active:scale-[0.99]",
          isMe ? "bg-clay-soft/40 ring-1 ring-inset ring-clay/40" : "bg-surface",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
            MEDALS[rank - 1],
          )}
          aria-hidden
        >
          {rank}
        </span>
        <Avatar name={entry.name} uid={entry.uid} src={entry.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <NameLine name={entry.name} isMe={isMe} bold />
          <p className="truncate text-sm text-soft">{unit}</p>
        </div>
        <ScoreBadge score={entry.score} unit={unit} />
      </Link>
    </li>
  );
}

/** Ranks 4+: compact rows echoing the directory cards. */
function RankRow({
  entry,
  rank,
  unit,
  isMe,
}: {
  entry: LeaderboardEntry;
  rank: number;
  unit: string;
  isMe: boolean;
}) {
  return (
    <li>
      <Link
        href={`/people/${entry.uid}`}
        className={cn(
          "flex items-center gap-3 rounded-card p-3 shadow-card transition-transform active:scale-[0.99]",
          isMe ? "bg-clay-soft/40 ring-1 ring-inset ring-clay/40" : "bg-surface",
        )}
      >
        <span className="w-6 shrink-0 text-center text-[13px] font-bold text-faint" aria-hidden>
          {rank}
        </span>
        <Avatar name={entry.name} uid={entry.uid} src={entry.photoUrl} size="md" />
        <div className="min-w-0 flex-1">
          <NameLine name={entry.name} isMe={isMe} />
          <p className="truncate text-sm text-soft">{unit}</p>
        </div>
        <ScoreBadge score={entry.score} unit={unit} />
      </Link>
    </li>
  );
}
