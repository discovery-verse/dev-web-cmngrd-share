import { NextRequest, NextResponse } from "next/server";
import { adminDb, toMillis } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { ReportDTO } from "@/lib/api-types";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const status = req.nextUrl.searchParams.get("status") ?? "open";
    const snap = await adminDb.collection("reports").where("status", "==", status).get();
    const reports: ReportDTO[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          targetType: data.targetType,
          targetPath: data.targetPath ?? "",
          excerpt: data.excerpt ?? "",
          reason: data.reason ?? "",
          reporterId: data.reporterId ?? "",
          status: data.status ?? "open",
          createdAt: toMillis(data.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return NextResponse.json({ reports });
  } catch (e) {
    return errorResponse(e);
  }
}
