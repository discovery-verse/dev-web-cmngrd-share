import { NextRequest, NextResponse } from "next/server";
import { uploadAdminImage } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { RoomFile } from "@/lib/types";

/**
 * Upload a downloadable resource (slides, worksheets, …) for attaching to a
 * room. Unlike /api/admin/media this keeps no Firestore doc — the room document
 * owns the file metadata, and the rooms PATCH/DELETE routes clean up the
 * storage object when it's removed.
 */
const ACCEPTED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("No file was uploaded.");

    const ext = ACCEPTED[file.type];
    if (!ext) {
      throw new Error("Please upload a PDF, Office document, CSV, text, ZIP, or image file.");
    }
    if (file.size > MAX_BYTES) throw new Error("That file is too large (max 25 MB).");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, path } = await uploadAdminImage(buffer, file.type, { folder: "files", ext });

    const name = ((form.get("name") as string) || file.name || "Download").trim().slice(0, 120);
    const dto: RoomFile = { url, path, name, contentType: file.type, size: file.size };
    return NextResponse.json({ file: dto });
  } catch (e) {
    return errorResponse(e);
  }
}
