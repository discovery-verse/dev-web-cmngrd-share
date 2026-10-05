import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

type Ctx = { params: Promise<{ uid: string }> };

/** Grant admin — writes admins/{uid} (client rules forbid this; SDK only). */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAdmin(req);
    const { uid } = await ctx.params;
    await adminDb.doc(`admins/${uid}`).set({ grantedAt: FieldValue.serverTimestamp(), by: session.uid });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Revoke admin. Refuses self-revoke to avoid locking yourself out. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAdmin(req);
    const { uid } = await ctx.params;
    if (uid === session.uid) throw new Error("You can't revoke your own admin access.");
    await adminDb.doc(`admins/${uid}`).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
