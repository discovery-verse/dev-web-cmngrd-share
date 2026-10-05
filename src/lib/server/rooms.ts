import "server-only";
import { ensureUrlScheme, type RoomFile, type RoomPerson } from "@/lib/types";

/** Caps on room lists — keeps the doc comfortably under Firestore's 1MB limit. */
const MAX_LIST = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function cleanDate(raw: unknown): string {
  return typeof raw === "string" && DATE_RE.test(raw.trim()) ? raw.trim() : "";
}

export function cleanTime(raw: unknown): string {
  return typeof raw === "string" && TIME_RE.test(raw.trim()) ? raw.trim() : "";
}

/**
 * Room link → a usable href, or "" when unset/unusable. A scheme is added when
 * the admin typed a bare domain, and anything that isn't http(s) after that
 * (javascript:, data:) is dropped rather than rendered as a member-facing link.
 */
export function cleanLink(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const url = ensureUrlScheme(raw.trim().slice(0, 500));
  return /^https?:\/\//i.test(url) ? url : "";
}

export function cleanOrder(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Keep only well-formed { uid, name, role } entries, deduped by uid. */
export function cleanPeople(raw: unknown): RoomPerson[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const people: RoomPerson[] = [];
  for (const entry of raw) {
    if (people.length >= MAX_LIST) break;
    const p = entry as Partial<RoomPerson> | null;
    const uid = typeof p?.uid === "string" ? p.uid.trim() : "";
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    if (!uid || !name || seen.has(uid)) continue;
    seen.add(uid);
    people.push({
      uid,
      name: name.slice(0, 120),
      role: (typeof p?.role === "string" ? p.role.trim() : "").slice(0, 60),
    });
  }
  return people;
}

/** Keep only well-formed download entries that came from our upload route. */
export function cleanFiles(raw: unknown): RoomFile[] {
  if (!Array.isArray(raw)) return [];
  const files: RoomFile[] = [];
  for (const entry of raw) {
    if (files.length >= MAX_LIST) break;
    const f = entry as Partial<RoomFile> | null;
    const url = typeof f?.url === "string" ? f.url.trim() : "";
    if (!url) continue;
    files.push({
      url,
      path: typeof f?.path === "string" ? f.path.trim() : "",
      name: ((typeof f?.name === "string" && f.name.trim()) || "Download").slice(0, 120),
      contentType: typeof f?.contentType === "string" ? f.contentType : "",
      size: Number.isFinite(Number(f?.size)) ? Number(f?.size) : 0,
    });
  }
  return files;
}

/** Only ever delete objects our own /api/admin/files route wrote. */
export function isRoomFilePath(path: string): boolean {
  return path.startsWith("cmngrd/files/");
}
