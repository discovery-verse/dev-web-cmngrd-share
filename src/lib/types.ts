import type { Timestamp } from "firebase/firestore";

/** A group a member identifies with — a member may have several. */
export type MemberGroup =
  | "founder"
  | "executive"
  | "nonprofit"
  | "church"
  | "investor"
  | "corporate"
  | "speaker"
  | "panelist"
  | "startup-pitch"
  | "team";

/**
 * Groups a member may pick for themselves (onboarding, My Profile). The rest
 * — speaker / panelist / startup-pitch / team — are event-role tags an admin
 * assigns; enforced both in the UI (these are simply never offered as
 * self-serve toggles) and in firestore.rules (a self-write can't add one).
 */
export const SELF_SERVE_GROUPS: MemberGroup[] = [
  "founder",
  "executive",
  "nonprofit",
  "church",
  "investor",
  "corporate",
];

// Insertion order drives how the options render everywhere they're listed.
export const GROUP_LABELS: Record<MemberGroup, string> = {
  founder: "Founder",
  executive: "Executive",
  nonprofit: "Non-Profit Leader",
  church: "Church Leader",
  investor: "Investor",
  corporate: "Corporate Leader",
  speaker: "Speaker",
  panelist: "Panelist",
  "startup-pitch": "Startup Pitch",
  team: "Team",
};

/** An event / sub-community (e.g. Summit). Admin-managed. */
export interface CommunityEvent {
  id: string;
  name: string;
  /** Short label for the switcher pill, e.g. "Summit". */
  shortName: string;
  order: number;
  /**
   * When true, members viewing this event can only DM accepted connections.
   * Per-event replacement for the old global config flag; enforced in the UI
   * against whichever event is currently active.
   */
  dmRequiresConnection?: boolean;
  /**
   * When false, brand-new visitors can't self-sign-up through this event's
   * sign-in link — only members an admin has added get in. Defaults to true.
   */
  allowSignups?: boolean;
  /**
   * Admin-authored info/logistics page (hotel, transport, contacts, …), stored
   * as Markdown (raw HTML passes through). Rendered on the member /info page.
   */
  infoContent?: string;
}

/**
 * Public member profile — the ONLY member fields readable by other members.
 * Contact details live in members/{uid}/private/contact and are gated by
 * Firestore rules behind an accepted connection.
 */
export interface Member {
  uid: string;
  name: string;
  title: string;
  company: string;
  /** Where the member is based — City / Country / Region. Public. */
  location: string;
  /** Free-text self-introduction shown on the public profile. */
  about: string;
  /** Free-text interests & redemptive burden. Optional, public. */
  interests: string;
  /** A member may identify with more than one group, or none yet. */
  groups: MemberGroup[];
  /** Lower-cased copies for client-side search. */
  nameLower: string;
  companyLower: string;
  /** Uploaded profile photo; falls back to the generated initials avatar. */
  photoUrl?: string;
  /** Uploaded profile cover banner; falls back to the generated gradient. */
  coverUrl?: string;
  /**
   * Event ids this member is approved for. Writable ONLY by admins (enforced
   * in firestore.rules) — members cannot self-approve into an event.
   */
  events?: string[];
  createdAt: Timestamp | null;
}

/** Max lengths for the open-text public profile fields — kept in sync with
 * firestore.rules (member update validation) and the onboarding route. */
export const MAX_LOCATION = 120;
export const MAX_ABOUT = 1500;
export const MAX_INTERESTS = 1500;

/**
 * Reads a member's groups from raw Firestore data, preferring the `groups`
 * array and falling back to the pre-migration singular `group` field so
 * members written before multi-group support still display correctly.
 */
export function resolveMemberGroups(data: { groups?: unknown; group?: unknown }): MemberGroup[] {
  if (Array.isArray(data.groups)) return data.groups as MemberGroup[];
  return data.group ? [data.group as MemberGroup] : [];
}

/** Normalizes a raw `members/{uid}` snapshot into a fully-typed Member. */
export function normalizeMember(uid: string, data: Record<string, unknown>): Member {
  return {
    uid,
    name: (data.name as string) ?? "",
    title: (data.title as string) ?? "",
    company: (data.company as string) ?? "",
    location: (data.location as string) ?? "",
    about: (data.about as string) ?? "",
    interests: (data.interests as string) ?? "",
    groups: resolveMemberGroups(data),
    nameLower: (data.nameLower as string) ?? "",
    companyLower: (data.companyLower as string) ?? "",
    photoUrl: data.photoUrl as string | undefined,
    coverUrl: data.coverUrl as string | undefined,
    events: (data.events as string[] | undefined) ?? [],
    createdAt: (data.createdAt as Timestamp | null) ?? null,
  };
}

/** Category for a member-added profile link. */
export type LinkType = "website" | "projects" | "social" | "github" | "other";

export const LINK_TYPES: LinkType[] = ["website", "projects", "social", "github", "other"];

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  website: "Website",
  projects: "Projects",
  social: "Social Media",
  github: "GitHub",
  other: "Other",
};

/** A single member-added link — a category plus its URL. */
export interface ProfileLink {
  type: LinkType;
  url: string;
}

/** Most links a member may add to their profile. */
export const MAX_LINKS = 10;

/**
 * Make a user-entered URL usable as an href: if it has no scheme (e.g.
 * "zavior.ai" or "www.zavior.ai"), assume https://. Existing http(s) URLs are
 * left untouched. Mirrors the fallback the profile view already applies at
 * render time, so we store the same value we'd display.
 */
export function ensureUrlScheme(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Normalises a raw `links` value (from a contact-card snapshot or a request
 * body) into a clean, capped list: only known categories, non-empty URLs,
 * trimmed, and no more than MAX_LINKS entries.
 */
export function normalizeLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 2000) continue;
    if (typeof type !== "string" || !LINK_TYPES.includes(type as LinkType)) continue;
    out.push({ type: type as LinkType, url: ensureUrlScheme(trimmed) });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/** Private contact card, subcollection doc members/{uid}/private/contact. */
export interface ContactCard {
  email: string;
  phone: string;
  linkedin: string;
  /** Member-added links (website / projects / social), shared like the rest of
   * the contact card — only with accepted connections. */
  links?: ProfileLink[];
}

export type ConnectionStatus = "pending" | "accepted";

/** Doc id is pairId(a, b) so a pair can only ever have one connection doc. */
export interface Connection {
  id: string;
  users: [string, string];
  requestedBy: string;
  status: ConnectionStatus;
  createdAt: Timestamp | null;
}

/** DM thread; doc id is pairId(a, b). */
export interface Thread {
  id: string;
  participants: [string, string];
  /** Denormalised display names so the thread list renders without extra reads. */
  participantNames: Record<string, string>;
  lastMessage: string;
  lastSenderId: string;
  lastMessageAt: Timestamp | null;
  /** uid → last time that user opened the thread; drives unread badges. */
  reads: Record<string, Timestamp>;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface Post {
  id: string;
  /** Event this post belongs to; the board is scoped per event. */
  eventId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  link: string;
  topic: string;
  /** Optional uploaded cover image; falls back to the generated gradient. */
  imageUrl?: string;
  /** Uids who reacted; rules ensure you can only add/remove yourself. */
  reactedBy: string[];
  reactionCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null;
}

/** A member spotlighted on a room (speaker, moderator, …). Name is denormalized
 *  so the lobby can render without a members lookup. */
export interface RoomPerson {
  uid: string;
  name: string;
  role: string;
}

/** A downloadable resource attached to a room (slides, worksheets, …). */
export interface RoomFile {
  /** Tokenised download URL — works in a plain <a href>. */
  url: string;
  /** Storage object path; the admin API uses it to clean up removed files. */
  path: string;
  name: string;
  contentType: string;
  size: number;
}

export interface Room {
  id: string;
  /** Event this room belongs to; the lobby is scoped per event. */
  eventId: string;
  name: string;
  topic: string;
  /** Optional cover photo (board view); falls back to a generated cover. */
  imageUrl?: string;
  /** Agenda details — all optional; rooms without them render as before. */
  date?: string; // "2026-03-12"
  startTime?: string; // "14:30" (24h)
  endTime?: string;
  location?: string;
  /** Optional URL members can open from the room (sign-up form, chat invite,
   *  slides). Stored with a scheme so it's usable as an href as-is. */
  link?: string;
  /** Button text for `link`; falls back to the bare domain. */
  linkLabel?: string;
  /** Lower numbers appear first in the lobby; ties fall back to newest-first. */
  order?: number;
  /**
   * Staged room — invisible to members until an admin reveals it. Enforced in
   * firestore.rules (get denies, list requires a hidden == false filter), not
   * just the UI. Legacy rooms are backfilled via `npm run seed -- --backfill-hidden`.
   */
  hidden?: boolean;
  people?: RoomPerson[];
  files?: RoomFile[];
  createdBy: string;
  createdAt: Timestamp | null;
}

export interface RoomMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp | null;
}

export type ReportTargetType = "post" | "comment" | "message" | "room-message" | "member";

export interface Report {
  id: string;
  targetType: ReportTargetType;
  /** Firestore document path of the reported content (or member). */
  targetPath: string;
  /** Short human-readable excerpt so admins can triage without chasing paths. */
  excerpt: string;
  reason: string;
  reporterId: string;
  status: "open" | "resolved";
  createdAt: Timestamp | null;
}

/** App-wide config, stored at config/app and enforced in security rules. */
export interface AppConfig {
  /** When true, DMs can only be started with (and sent to) accepted connections. */
  dmRequiresConnection: boolean;
}
