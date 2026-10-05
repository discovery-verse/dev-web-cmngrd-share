/**
 * JSON wire types for the /api/admin routes. Firestore Timestamps are
 * serialized to epoch millis (or null) since they can't cross a JSON boundary.
 */
import type { MemberGroup, RoomFile, RoomPerson } from "@/lib/types";

export interface MemberDTO {
  uid: string;
  name: string;
  title: string;
  company: string;
  groups: MemberGroup[];
  events: string[];
  /** From members/{uid}/private/contact. */
  email: string;
  phone: string;
  linkedin: string;
  banned: boolean;
  admin: boolean;
  createdAt: number | null;
}

export interface EventDTO {
  id: string;
  name: string;
  shortName: string;
  order: number;
  /** Public info page for the event (e.g. its Luma page). */
  eventUrl: string;
  /** Where members go to register/RSVP — often the same as eventUrl. */
  signupUrl: string;
  logoUrl: string;
  coverUrl: string;
  /** When true, members can only DM accepted connections while in this event. */
  dmRequiresConnection: boolean;
  /** When false, only admin-added members can get in — no self-sign-up. */
  allowSignups: boolean;
  /** Admin-authored info/logistics page (Markdown). Shown to members at /info. */
  infoContent: string;
}

/** Best-effort prefill data scraped from a pasted event page (e.g. Luma). */
export interface EventImportDTO {
  name: string;
  eventUrl: string;
  signupUrl: string;
  coverUrl: string;
}

/** Public, unauthenticated branding subset — themes the per-event sign-in page. */
export interface EventBrandingDTO {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
  coverUrl: string;
  /** Drives the "invite-only" notice on the per-event sign-in page. */
  allowSignups: boolean;
  /** Admin-authored info/logistics (Markdown); shown below the sign-in form. */
  infoContent: string;
}

export interface RoomDTO {
  id: string;
  eventId: string;
  name: string;
  topic: string;
  imageUrl: string;
  /** Agenda details — empty string / 0 / [] when unset. */
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  link: string;
  linkLabel: string;
  order: number;
  /** Staged room — members can't see it until an admin reveals it. */
  hidden: boolean;
  people: RoomPerson[];
  files: RoomFile[];
  /** Members who said "I'll be attending" — read-only, written by the app. */
  rsvps: { uid: string; name: string }[];
  createdBy: string;
  createdAt: number | null;
}

export interface MediaDTO {
  id: string;
  /** Tokenised download URL, safe to reuse in any `<img src>` on the platform. */
  url: string;
  /** Storage object path — used server-side to delete the object. */
  path: string;
  /** Admin-supplied label for finding it later. */
  name: string;
  contentType: string;
  size: number;
  createdBy: string;
  createdAt: number | null;
}

export interface ReportDTO {
  id: string;
  targetType: "post" | "comment" | "message" | "room-message" | "member";
  targetPath: string;
  excerpt: string;
  reason: string;
  reporterId: string;
  status: "open" | "resolved";
  createdAt: number | null;
}

export interface StatsDTO {
  members: number;
  rooms: number;
  openReports: number;
  events: number;
  /** eventId → count of members approved for it. */
  perEvent: Record<string, number>;
  /** eventId → count of rooms scoped to it. */
  perEventRooms: Record<string, number>;
}

/** One parsed/normalized import row as sent from the client. */
export interface ImportRow {
  name: string;
  email: string;
  /** ";" or "|" separated group labels as typed; server splits + validates. */
  group?: string;
  title?: string;
  company?: string;
  /** ";" or "|" separated event ids as typed; server splits + validates. */
  events?: string;
  phone?: string;
  linkedin?: string;
}

export type RowVerdictKind = "new" | "exists-no-profile" | "exists-with-profile" | "error";

export interface RowVerdict {
  rowIndex: number;
  email: string;
  name: string;
  kind: RowVerdictKind;
  banned: boolean;
  events: string[];
  errors: string[];
}

export type CommitAction = "created" | "updated" | "skipped" | "error";

export interface CommitResult {
  rowIndex: number;
  email: string;
  uid: string | null;
  action: CommitAction;
  message: string;
}

export interface ImportPolicy {
  existing: "skip" | "update";
  unbanOnImport: boolean;
}
