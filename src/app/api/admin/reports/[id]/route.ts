import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Resolve/dismiss a report without acting on the target. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    await adminDb.doc(`reports/${id}`).update({ status: "resolved" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
