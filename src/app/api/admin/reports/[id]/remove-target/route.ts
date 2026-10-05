import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Remove the content a report points at, then mark the report resolved.
 * Mirrors the PWA's in-app admin triage:
 *   - member: ban first (blocks new writes), then delete profile + contact
 *   - message: DMs are private; caller handles out-of-band. We refuse.
 *   - post: recursiveDelete (has a comments subcollection)
 *   - comment / room-message: delete the target doc
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAdmin(req);
    const { id } = await ctx.params;

    const reportRef = adminDb.doc(`reports/${id}`);
    const snap = await reportRef.get();
    if (!snap.exists) throw new Error("Report not found.");
    const report = snap.data() as { targetType: string; targetPath: string };
    const segments = report.targetPath.split("/");

    if (report.targetType === "member") {
      const uid = segments[1];
      await adminDb.doc(`banned/${uid}`).set({ bannedAt: FieldValue.serverTimestamp(), by: session.uid });
      await adminDb.doc(`members/${uid}/private/contact`).delete().catch(() => {});
      await adminDb.doc(`members/${uid}`).delete().catch(() => {});
    } else if (report.targetType === "message") {
      throw new Error("DM conversations are private — review with the parties, then dismiss.");
    } else if (report.targetType === "post") {
      await adminDb.recursiveDelete(adminDb.doc(report.targetPath));
    } else {
      await adminDb.doc(report.targetPath).delete();
    }

    await reportRef.update({ status: "resolved" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
