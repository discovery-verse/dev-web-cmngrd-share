import type { Member, Post } from "@/lib/types";

/**
 * Event leaderboards, all derived in-memory from the (already readable) posts
 * collection — no schema, rules, or server aggregation. See computeLeaderboards.
 */
export type LeaderboardMetric = "loved" | "supportive" | "contributor" | "discussed";

export interface LeaderboardEntry {
  uid: string;
  name: string;
  photoUrl?: string;
  score: number;
}

/** Display metadata per metric. `unit` is the per-row subtitle noun; `short`
 *  is used in the "You're #N in …" footer. Icons are mapped in the component so
 *  this stays a pure, framework-free data module. */
export const LEADERBOARD_METRICS: {
  value: LeaderboardMetric;
  label: string;
  short: string;
  unit: string;
}[] = [
  { value: "loved", label: "Most Loved", short: "loved", unit: "reactions received" },
  { value: "supportive", label: "Most Supportive", short: "supportive", unit: "likes given" },
  { value: "contributor", label: "Top Contributor", short: "contributor", unit: "posts shared" },
  { value: "discussed", label: "Most Discussed", short: "discussed", unit: "comments received" },
];

/**
 * Compute all four leaderboards in a single pass over the event's posts.
 *
 * Only current members (those present in `members`) are ranked: `reactedBy`
 * holds bare uids, so a reactor who left the event has no resolvable name/
 * avatar and is dropped; likewise an author who left is excluded. Zero scores
 * are omitted. Ties break deterministically on name.
 */
export function computeLeaderboards(
  posts: Post[],
  members: Member[],
): Record<LeaderboardMetric, LeaderboardEntry[]> {
  const byUid = new Map(members.map((m) => [m.uid, m]));

  const received = new Map<string, number>(); // reactions on posts you authored
  const given = new Map<string, number>(); // reactions you gave to others' posts
  const authored = new Map<string, number>(); // posts you shared
  const comments = new Map<string, number>(); // comments on posts you authored

  const bump = (tally: Map<string, number>, uid: string, by: number) => {
    tally.set(uid, (tally.get(uid) ?? 0) + by);
  };

  for (const post of posts) {
    if (byUid.has(post.authorId)) {
      bump(received, post.authorId, post.reactionCount ?? 0);
      bump(authored, post.authorId, 1);
      bump(comments, post.authorId, post.commentCount ?? 0);
    }
    for (const uid of post.reactedBy ?? []) {
      if (byUid.has(uid)) bump(given, uid, 1);
    }
  }

  const rank = (tally: Map<string, number>): LeaderboardEntry[] => {
    const entries: LeaderboardEntry[] = [];
    for (const [uid, score] of tally) {
      const member = byUid.get(uid);
      if (!member || score <= 0) continue;
      entries.push({ uid, name: member.name, photoUrl: member.photoUrl, score });
    }
    return entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  };

  return {
    loved: rank(received),
    supportive: rank(given),
    contributor: rank(authored),
    discussed: rank(comments),
  };
}

/** 1-based rank of a uid within a ranked list, or null if absent. */
export function findRank(entries: LeaderboardEntry[], uid: string): number | null {
  const i = entries.findIndex((e) => e.uid === uid);
  return i === -1 ? null : i + 1;
}
