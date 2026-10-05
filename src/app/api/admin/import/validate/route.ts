import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { validateRows } from "@/lib/server/import";
import type { ImportRow } from "@/lib/api-types";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { rows } = (await req.json()) as { rows: ImportRow[] };
    if (!Array.isArray(rows)) throw new Error("Expected { rows: [...] }");
    if (rows.length > 1000) throw new Error("Too many rows (max 1000 per import).");
    const results = await validateRows(rows);
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
