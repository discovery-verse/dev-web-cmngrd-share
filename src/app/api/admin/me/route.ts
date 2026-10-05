import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/server/auth";

/** Confirm the bearer token belongs to an admin. 200 with identity, else 401/403. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin(req);
    return NextResponse.json({ uid: session.uid, email: session.email });
  } catch (e) {
    return errorResponse(e);
  }
}
