import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

type Ctx = { params: Promise<{ uid: string }> };

/** Ban — blocks the user's writes via the notBanned() rule in firestore.rules. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAdmin(req);
    const { uid } = await ctx.params;
    await adminDb.doc(`banned/${uid}`).set({ bannedAt: FieldValue.serverTimestamp(), by: session.uid });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Unban. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { uid } = await ctx.params;
    await adminDb.doc(`banned/${uid}`).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
