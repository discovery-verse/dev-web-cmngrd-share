import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Canonical id for any two-member relationship (connections, DM threads).
 * Sorted so both sides always compute the same id — the security rules
 * recompute and verify this server-side.
 */
export function pairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function otherUid(pair: readonly string[], me: string): string {
  return pair[0] === me ? pair[1] : pair[0];
}

/** Warm gradient stops used for generated covers across the app. */
const COVER_PALETTES: [string, string][] = [
  ["#a8512e", "#c97c4a"],
  ["#5c7b66", "#8aa78f"],
  ["#b97a24", "#d9a55a"],
  ["#4a6f8e", "#7b98b4"],
  ["#7b5a75", "#a3849d"],
];

/** Deterministic warm gradient per seed (room id, uid, …) for generated covers. */
export function coverGradient(seed: string): { from: string; to: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
  return { from, to };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Short relative/absolute time for list rows: "2m", "3h", "Mon", "12 Jan". */
export function shortTime(ts: Timestamp | null): string {
  if (!ts) return "";
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function messageTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return ts.toDate().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const ROOM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One-line agenda summary for a room: "Thu 12 Mar · 2:30 PM – 4:00 PM · Hall B".
 * Empty string when the room has no schedule details. Date/time strings are
 * parsed as local wall-clock values so nothing shifts across timezones.
 * Pass `withDate: false` where a day heading already gives the date, and
 * `withLocation: false` where the location is rendered separately.
 */
export function roomScheduleLabel(
  room: {
    date?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
  },
  opts: { withDate?: boolean; withLocation?: boolean } = {},
): string {
  const parts: string[] = [];
  if (opts.withDate !== false && room.date && ROOM_DATE_RE.test(room.date)) {
    parts.push(
      new Date(`${room.date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    );
  }
  const fmt = (t?: string) =>
    t && /^\d{2}:\d{2}$/.test(t)
      ? new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
  const start = fmt(room.startTime);
  const end = fmt(room.endTime);
  if (start) parts.push(end ? `${start} – ${end}` : start);
  if (opts.withLocation !== false && room.location) parts.push(room.location);
  return parts.join(" · ");
}

/**
 * Fallback button text for a bare URL: the host without "www.", e.g.
 * "chat.whatsapp.com". Keeps long invite links from spilling across a card.
 */
export function linkHostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

/** Day-group heading, e.g. "Thursday 30 July"; "" for an invalid date. */
export function roomDayLabel(date: string): string {
  if (!ROOM_DATE_RE.test(date)) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Group rooms by their agenda date, preserving the incoming order inside each
 * group: dated days first (ascending), undated rooms last under date "".
 */
export function groupRoomsByDay<T extends { date?: string }>(
  rooms: T[],
): { date: string; rooms: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const room of rooms) {
    const key = room.date && ROOM_DATE_RE.test(room.date) ? room.date : "";
    const list = groups.get(key);
    if (list) list.push(room);
    else groups.set(key, [room]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a < b ? -1 : 1))
    .map(([date, rooms]) => ({ date, rooms }));
}

/** "1.4 MB" / "230 KB" for download chips. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Normalise a user-entered link: allow bare domains, require http(s). */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}
