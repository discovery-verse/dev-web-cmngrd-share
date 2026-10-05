import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { normalizeGroup } from "@/lib/admin-utils";
import { resolveMemberGroups } from "@/lib/types";

type Ctx = { params: Promise<{ uid: string }> };

interface MemberPatch {
  name?: string;
  title?: string;
  company?: string;
  /** Full replace — used by the single-member editor. */
  groups?: string[];
  /** Additive/subtractive — used by bulk actions, atomic via FieldValue. */
  groupsAdd?: string[];
  groupsRemove?: string[];
  /** Full replace — used by the single-member editor. */
  events?: string[];
  eventsAdd?: string[];
  eventsRemove?: string[];
  contact?: { email?: string; phone?: string; linkedin?: string };
}

function normalizedGroups(raw: string[]): string[] {
  return raw.map((g) => {
    const normalized = normalizeGroup(g);
    if (!normalized) throw new Error(`Unknown group "${g}".`);
    return normalized;
  });
}

function cleanEventIds(raw: string[]): string[] {
  return raw.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { uid } = await ctx.params;
    const ref = adminDb.doc(`members/${uid}`);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Member not found.");

    const body = (await req.json()) as MemberPatch;
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      if (!body.name.trim()) throw new Error("Name cannot be empty.");
      update.name = body.name.trim();
      update.nameLower = body.name.trim().toLowerCase();
    }
    if (typeof body.title === "string") update.title = body.title.trim();
    if (typeof body.company === "string") {
      update.company = body.company.trim();
      update.companyLower = body.company.trim().toLowerCase();
    }
    if (Array.isArray(body.groups)) {
      update.groups = [...new Set(normalizedGroups(body.groups))];
    } else if (body.groupsAdd?.length || body.groupsRemove?.length) {
      // Not a plain FieldValue.arrayUnion/arrayRemove: a pre-migration profile
      // only has the legacy singular `group` field, and arrayUnion on a
      // never-set `groups` field would start from empty, silently dropping
      // it. Seed from whatever the member currently has either way, then
      // union/subtract in application code.
      const current = resolveMemberGroups(snap.data() ?? {});
      if (body.groupsAdd?.length) {
        update.groups = [...new Set([...current, ...normalizedGroups(body.groupsAdd)])];
      } else if (body.groupsRemove?.length) {
        const removing = new Set(normalizedGroups(body.groupsRemove));
        update.groups = current.filter((g) => !removing.has(g));
      }
    }
    if (Array.isArray(body.events)) {
      update.events = cleanEventIds(body.events);
    } else if (body.eventsAdd?.length || body.eventsRemove?.length) {
      if (body.eventsAdd?.length) update.events = FieldValue.arrayUnion(...cleanEventIds(body.eventsAdd));
      else if (body.eventsRemove?.length) update.events = FieldValue.arrayRemove(...cleanEventIds(body.eventsRemove));
    }
    if (Object.keys(update).length) await ref.update(update);

    if (body.contact) {
      const c: Record<string, string> = {};
      if (typeof body.contact.email === "string") c.email = body.contact.email.trim().toLowerCase();
      if (typeof body.contact.phone === "string") c.phone = body.contact.phone.trim();
      if (typeof body.contact.linkedin === "string") c.linkedin = body.contact.linkedin.trim();
      if (Object.keys(c).length) {
        await adminDb.doc(`members/${uid}/private/contact`).set(c, { merge: true });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Delete a member's profile + contact card. Pass { deleteAuthUser: true } to
 * also remove their Firebase Auth account (they can no longer sign in).
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { uid } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { deleteAuthUser?: boolean };

    await adminDb.doc(`members/${uid}/private/contact`).delete().catch(() => {});
    await adminDb.doc(`members/${uid}`).delete();
    if (body.deleteAuthUser) {
      await adminAuth.deleteUser(uid).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
