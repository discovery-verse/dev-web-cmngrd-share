import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { AppConfig } from "@/lib/types";

const REF = "config/app";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const snap = await adminDb.doc(REF).get();
    const data = (snap.data() ?? {}) as Partial<AppConfig>;
    return NextResponse.json({ config: { dmRequiresConnection: !!data.dmRequiresConnection } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as Partial<AppConfig>;
    const update: Record<string, unknown> = {};
    if (typeof body.dmRequiresConnection === "boolean") {
      update.dmRequiresConnection = body.dmRequiresConnection;
    }
    await adminDb.doc(REF).set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
