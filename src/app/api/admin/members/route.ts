import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { toMemberDTOs } from "@/lib/server/members";
import { commitRows } from "@/lib/server/import";
import type { ImportRow } from "@/lib/api-types";

/**
 * List members. Optional filters:
 *   ?search=  prefix match on name/company (client also filters live)
 *   ?event=   only members approved for that event
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const event = req.nextUrl.searchParams.get("event");
    const search = (req.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();

    const q = event
      ? adminDb.collection("members").where("events", "array-contains", event).orderBy("nameLower")
      : adminDb.collection("members").orderBy("nameLower");

    const snap = await q.get();
    let docs = snap.docs;
    if (search) {
      docs = docs.filter((d) => {
        const data = d.data();
        return (data.nameLower ?? "").includes(search) || (data.companyLower ?? "").includes(search);
      });
    }
    const members = await toMemberDTOs(docs);
    return NextResponse.json({ members });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Single add — one row through the shared import path (always upsert). */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const row = (await req.json()) as ImportRow;
    const [result] = await commitRows([row], { existing: "update", unbanOnImport: false });
    if (result.action === "error") throw new Error(result.message);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
