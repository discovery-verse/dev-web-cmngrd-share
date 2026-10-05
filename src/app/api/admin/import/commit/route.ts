import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import { commitRows } from "@/lib/server/import";
import type { ImportPolicy, ImportRow } from "@/lib/api-types";

/**
 * Commit a chunk of import rows. The client sends chunks of ~50 so each request
 * stays well within Cloud Run / route timeouts and gives incremental progress.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { rows, policy } = (await req.json()) as { rows: ImportRow[]; policy: ImportPolicy };
    if (!Array.isArray(rows)) throw new Error("Expected { rows: [...] }");
    if (rows.length > 100) throw new Error("Chunk too large (max 100 rows).");
    const results = await commitRows(rows, {
      existing: policy?.existing === "update" ? "update" : "skip",
      unbanOnImport: !!policy?.unbanOnImport,
    });
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
