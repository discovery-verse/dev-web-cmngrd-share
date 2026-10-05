"use client";

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

/**
 * Image uploads for user-owned content (avatars, profile covers, idea images).
 *
 * Everything lives under `cmngrd/u/{uid}/…` — the shared-bucket namespace plus
 * the owner's uid, which is what storage.rules checks (Storage rules can't read
 * Firestore, so ownership has to be provable from the path). Admin-owned room
 * covers take a different, server-side path — see /api/admin/rooms.
 *
 * Files are downscaled and re-encoded in the browser before upload so we never
 * ship a 12 MP phone photo to the bucket (or to every viewer's `<img>`).
 */

export const UPLOAD_ROOT = "cmngrd/u";

/** Per-purpose sizing. Avatars are small and square-ish; banners/ideas wider. */
export const IMAGE_PRESETS = {
  avatar: { maxEdge: 512, quality: 0.85 },
  cover: { maxEdge: 1600, quality: 0.82 },
  idea: { maxEdge: 1600, quality: 0.82 },
} as const;

export type ImageKind = keyof typeof IMAGE_PRESETS;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // reject absurd inputs before decoding

export class UploadError extends Error {}

/**
 * Validate, downscale, and re-encode an image file to a JPEG Blob.
 * GIFs are passed through untouched (canvas would flatten animation).
 *
 * Exported so admin room-cover uploads can downscale in the browser and hand
 * the already-small blob to the server (which stores it via the Admin SDK),
 * keeping heavy image processing off the server with no extra dependency.
 */
export async function prepareImage(file: File, kind: ImageKind): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) {
    throw new UploadError("Please choose a JPEG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new UploadError("That image is too large — please pick one under 15 MB.");
  }
  if (file.type === "image/gif") return file;

  const { maxEdge, quality } = IMAGE_PRESETS[kind];
  const bitmap = await loadBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new UploadError("Your browser couldn't process that image.");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new UploadError("Your browser couldn't process that image.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new UploadError("That image couldn't be read. Try a different file.");
  }
}

/**
 * Upload a user image and return its public download URL (a tokenised URL that
 * renders in a plain `<img>`). `kind` picks both the sizing preset and the
 * storage sub-folder; the filename is timestamp-free-but-unique via `slot`.
 *
 * @param slot stable sub-path within the kind, e.g. a post id — omit for the
 *   singleton avatar/cover, which then overwrites the previous file in place.
 */
export async function uploadUserImage(
  uid: string,
  kind: ImageKind,
  file: File,
  slot?: string,
): Promise<string> {
  if (!uid) throw new UploadError("You need to be signed in to upload.");
  const blob = await prepareImage(file, kind);
  const ext = blob.type === "image/gif" ? "gif" : "jpg";
  const name = slot ? `${slot}.${ext}` : `current.${ext}`;
  const path = `${UPLOAD_ROOT}/${uid}/${kind}/${name}`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, blob, { contentType: blob.type, cacheControl: "public,max-age=3600" });
  return getDownloadURL(objectRef);
}

/** Best-effort delete of a previously-uploaded object by its download URL. */
export async function deleteUserImageByUrl(url: string): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Already gone, or replaced by a new upload at the same path — ignore.
  }
}

/** Extract the object path from a Firebase Storage download URL, if it is one. */
function storagePathFromUrl(url: string): string | null {
  const match = url.match(/\/o\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
