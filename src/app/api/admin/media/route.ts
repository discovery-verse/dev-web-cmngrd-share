import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, toMillis, uploadAdminImage } from "@/lib/server/admin";
import { errorResponse, requireAdmin } from "@/lib/server/auth";
import type { MediaDTO } from "@/lib/api-types";

const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 10 * 1024 * 1024;

function toDTO(id: string, data: FirebaseFirestore.DocumentData): MediaDTO {
  return {
    id,
    url: data.url ?? "",
    path: data.path ?? "",
    name: data.name ?? "",
    contentType: data.contentType ?? "",
    size: data.size ?? 0,
    createdBy: data.createdBy ?? "",
    createdAt: toMillis(data.createdAt),
  };
}

/** List the media library, newest first. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const snap = await adminDb.collection("media").orderBy("createdAt", "desc").get();
    const media = snap.docs.map((d) => toDTO(d.id, d.data()));
    return NextResponse.json({ media });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Upload an image to the shared media library. Accepts multipart/form-data with
 * a `file` (already downscaled client-side) and an optional `name` label. The
 * returned url is reusable anywhere on the platform.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("No image was uploaded.");

    const ext = ACCEPTED[file.type];
    if (!ext) throw new Error("Please upload a JPEG, PNG, WebP, or GIF image.");
    if (file.size > MAX_BYTES) throw new Error("That image is too large (max 10 MB).");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, path } = await uploadAdminImage(buffer, file.type, { folder: "media", ext });

    const name = ((form.get("name") as string) || file.name || "Untitled").trim().slice(0, 120);
    const ref = await adminDb.collection("media").add({
      url,
      path,
      name,
      contentType: file.type,
      size: file.size,
      createdBy: session.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      media: {
        id: ref.id,
        url,
        path,
        name,
        contentType: file.type,
        size: file.size,
        createdBy: session.uid,
        createdAt: null,
      } satisfies MediaDTO,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
