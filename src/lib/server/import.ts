import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/server/admin";
import { isEmail, parseEventIds, parseGroups } from "@/lib/admin-utils";
import type { CommitResult, ImportPolicy, ImportRow, RowVerdict } from "@/lib/api-types";
import type { MemberGroup } from "@/lib/types";

/** Fetch the set of valid event ids once per request. */
async function loadEventIds(): Promise<Set<string>> {
  const snap = await adminDb.collection("events").get();
  return new Set(snap.docs.map((d) => d.id));
}

interface NormalizedRow {
  rowIndex: number;
  name: string;
  email: string;
  groups: MemberGroup[];
  title: string;
  company: string;
  events: string[];
  phone: string;
  linkedin: string;
  errors: string[];
}

function normalizeRow(row: ImportRow, rowIndex: number, validEvents: Set<string>): NormalizedRow {
  const name = (row.name ?? "").trim();
  const email = (row.email ?? "").trim().toLowerCase();
  const { groups, unknown: unknownGroups } = parseGroups(row.group);
  const events = parseEventIds(row.events);
  const errors: string[] = [];

  if (!name) errors.push("Name is required");
  else if (name.length > 80) errors.push("Name too long (max 80)");
  if (!email) errors.push("Email is required");
  else if (!isEmail(email)) errors.push("Invalid email");
  if (unknownGroups.length) errors.push(`Unknown group(s): ${unknownGroups.join(", ")}`);
  const badEvents = events.filter((e) => !validEvents.has(e));
  if (badEvents.length) errors.push(`Unknown event id(s): ${badEvents.join(", ")}`);

  return {
    rowIndex,
    name,
    email,
    groups,
    title: (row.title ?? "").trim(),
    company: (row.company ?? "").trim(),
    events,
    phone: (row.phone ?? "").trim(),
    linkedin: (row.linkedin ?? "").trim(),
    errors,
  };
}

/** Dry-run: classify every row without writing anything. */
export async function validateRows(rows: ImportRow[]): Promise<RowVerdict[]> {
  const validEvents = await loadEventIds();
  const seenEmails = new Set<string>();
  const verdicts: RowVerdict[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = normalizeRow(rows[i], i, validEvents);
    const errors = [...r.errors];

    if (r.email && seenEmails.has(r.email)) errors.push("Duplicate email in this batch");
    if (r.email) seenEmails.add(r.email);

    let kind: RowVerdict["kind"] = "error";
    let banned = false;

    if (errors.length === 0) {
      try {
        const existing = await adminAuth.getUserByEmail(r.email);
        const profile = await adminDb.doc(`members/${existing.uid}`).get();
        kind = profile.exists ? "exists-with-profile" : "exists-no-profile";
        banned = (await adminDb.doc(`banned/${existing.uid}`).get()).exists;
      } catch {
        kind = "new";
      }
    }

    verdicts.push({
      rowIndex: i,
      email: r.email,
      name: r.name,
      kind,
      banned,
      events: r.events,
      errors,
    });
  }
  return verdicts;
}

/**
 * Commit rows: create/reuse the Auth user, write the member profile + contact,
 * apply event approvals, optionally unban. Idempotent and safe to re-run.
 */
export async function commitRows(rows: ImportRow[], policy: ImportPolicy): Promise<CommitResult[]> {
  const validEvents = await loadEventIds();
  const results: CommitResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = normalizeRow(rows[i], i, validEvents);
    if (r.errors.length) {
      results.push({ rowIndex: i, email: r.email, uid: null, action: "error", message: r.errors.join("; ") });
      continue;
    }

    try {
      // 1. Auth user — reuse if it exists, else create. uid always from Auth.
      let uid: string;
      try {
        uid = (await adminAuth.getUserByEmail(r.email)).uid;
      } catch {
        try {
          uid = (await adminAuth.createUser({ email: r.email, emailVerified: false })).uid;
        } catch (createErr) {
          // Lost a race — someone created it between the two calls.
          if ((createErr as { code?: string }).code === "auth/email-already-exists") {
            uid = (await adminAuth.getUserByEmail(r.email)).uid;
          } else {
            throw createErr;
          }
        }
      }

      const memberRef = adminDb.doc(`members/${uid}`);
      const exists = (await memberRef.get()).exists;

      if (exists && policy.existing === "skip") {
        results.push({ rowIndex: i, email: r.email, uid, action: "skipped", message: "Profile already exists" });
        continue;
      }

      const profileFields = {
        name: r.name,
        title: r.title,
        company: r.company,
        // Omit rather than write [] — on an existing profile that would
        // clobber groups the member (or a prior import) already set.
        ...(r.groups.length ? { groups: r.groups } : {}),
        nameLower: r.name.toLowerCase(),
        companyLower: r.company.toLowerCase(),
      };

      if (exists) {
        // Merge profile + union events (never clobber existing approvals).
        await memberRef.set(
          {
            ...profileFields,
            ...(r.events.length ? { events: FieldValue.arrayUnion(...r.events) } : {}),
          },
          { merge: true },
        );
      } else {
        await memberRef.set({
          ...profileFields,
          events: r.events,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Contact card — merge so a user's own later edits aren't wiped.
      await adminDb.doc(`members/${uid}/private/contact`).set(
        { email: r.email, phone: r.phone, linkedin: r.linkedin },
        { merge: true },
      );

      if (policy.unbanOnImport) {
        await adminDb.doc(`banned/${uid}`).delete().catch(() => {});
      }

      results.push({
        rowIndex: i,
        email: r.email,
        uid,
        action: exists ? "updated" : "created",
        message: exists ? "Profile updated" : "Profile created",
      });
    } catch (e) {
      results.push({
        rowIndex: i,
        email: r.email,
        uid: null,
        action: "error",
        message: e instanceof Error ? e.message : "Commit failed",
      });
    }
  }
  return results;
}
