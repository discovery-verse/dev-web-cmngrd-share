import { NextRequest, NextResponse } from "next/server";
import { adminDb, deleteAdminObject } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Remove a media item — the stored object first, then its library record. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const ref = adminDb.doc(`media/${id}`);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Media not found.");

    const path = snap.data()?.path as string | undefined;
    if (path) await deleteAdminObject(path);
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
