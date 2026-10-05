/**
 * Small pure helpers used by the admin console (client + server). General app
 * helpers (cn, initials, …) live in @/lib/utils.
 */
import type { MemberGroup } from "@/lib/types";

/** Accepts common label variants and maps to the canonical MemberGroup. */
export function normalizeGroup(raw: string): MemberGroup | null {
  const g = raw.trim().toLowerCase();
  if (["founder", "founder / operator", "founder/operator", "operator"].includes(g)) {
    return "founder";
  }
  if (["executive", "exec", "executive leader"].includes(g)) {
    return "executive";
  }
  if (["nonprofit", "non-profit", "non profit", "ngo", "non-profit leader"].includes(g)) {
    return "nonprofit";
  }
  if (["church", "church leader", "pastor", "ministry"].includes(g)) {
    return "church";
  }
  if (["investor", "vc", "angel", "investor / vc"].includes(g)) {
    return "investor";
  }
  if (["corporate", "corporate leader"].includes(g)) {
    return "corporate";
  }
  if (["speaker"].includes(g)) {
    return "speaker";
  }
  if (["panelist", "panellist"].includes(g)) {
    return "panelist";
  }
  if (["startup pitch", "startup-pitch", "startup", "pitch"].includes(g)) {
    return "startup-pitch";
  }
  if (["team", "staff", "organiser", "organizer", "crew"].includes(g)) {
    return "team";
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

/** Split a ";"/"|"/","-separated list of event ids into a clean array. */
export function parseEventIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Split a ";"/"|"/","-separated cell of group labels (e.g. from an import
 * row) into canonical MemberGroups, deduped, plus any tokens that didn't
 * match a known group.
 */
export function parseGroups(raw: string | undefined): { groups: MemberGroup[]; unknown: string[] } {
  if (!raw) return { groups: [], unknown: [] };
  const tokens = raw
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const groups: MemberGroup[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    const g = normalizeGroup(token);
    if (!g) unknown.push(token);
    else if (!groups.includes(g)) groups.push(g);
  }
  return { groups, unknown };
}

export function formatDate(millis: number | null): string {
  if (!millis) return "—";
  return new Date(millis).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
