import "server-only";
import { randomUUID } from "node:crypto";
import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase Admin SDK singleton for the /higherground admin console. This is the
 * ONLY server-side data path in the app — it bypasses Firestore security rules,
 * so every /api/admin route must gate on requireAdmin() first (see auth.ts).
 *
 * Demo mode: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set by
 * the `demo:dev` script; the Admin SDK auto-detects them (project demo-cg,
 * "(default)" database).
 *
 * Prod: application-default credentials (the Cloud Run runtime service account)
 * + FIRESTORE_DATABASE_ID when set, otherwise the (default) database.
 */
const isDemo = !!process.env.FIRESTORE_EMULATOR_HOST;
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";

// The Cloud Storage bucket (shared across sibling apps — everything we write is
// namespaced under `cmngrd/`). Falls back to the client-facing env var so a
// single value configures both sides.
const STORAGE_BUCKET = isDemo
  ? `${process.env.GCLOUD_PROJECT || "demo-cg"}.appspot.com`
  : process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "";

function initAdminApp(): App {
  if (getApps().length) return getApps()[0];
  if (isDemo) {
    return initializeApp({
      projectId: process.env.GCLOUD_PROJECT || "demo-cg",
      storageBucket: STORAGE_BUCKET,
    });
  }
  return initializeApp({ credential: applicationDefault(), storageBucket: STORAGE_BUCKET });
}

const app = initAdminApp();

export const adminDb: Firestore = getFirestore(app, isDemo ? "(default)" : DATABASE_ID);
export const adminAuth: Auth = getAuth(app);

/**
 * Store an object via the Admin SDK (bypasses Storage rules — callers must have
 * already passed requireAdmin) and return a stable, tokenised download URL that
 * works in a plain `<img>`/`<a>`, mirroring the client SDK's getDownloadURL.
 * Used by the admin Media library, room covers, and room downloads.
 */
export async function uploadAdminImage(
  buffer: Buffer,
  contentType: string,
  opts: { folder: string; ext: string },
): Promise<{ url: string; path: string }> {
  const token = randomUUID();
  const path = `cmngrd/${opts.folder}/${randomUUID()}.${opts.ext}`;
  const bucket = getStorage(app).bucket();
  await bucket.file(path).save(buffer, {
    contentType,
    metadata: {
      cacheControl: "public,max-age=3600",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return { url: downloadUrl(bucket.name, path, token), path };
}

function downloadUrl(bucketName: string, path: string, token: string): string {
  const host = process.env.STORAGE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = host
    ? `${host.startsWith("http") ? host : `http://${host}`}/v0/b/${bucketName}/o`
    : `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o`;
  return `${base}/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/**
 * Copy a stored object to a fresh path (with its own download token) so two
 * documents never share one object — deleting either can't break the other.
 * Returns null when the source object no longer exists.
 */
export async function copyAdminObject(
  srcPath: string,
): Promise<{ url: string; path: string } | null> {
  const bucket = getStorage(app).bucket();
  const src = bucket.file(srcPath);
  const [exists] = await src.exists();
  if (!exists) return null;

  const dot = srcPath.lastIndexOf(".");
  const ext = dot > srcPath.lastIndexOf("/") ? srcPath.slice(dot + 1) : "bin";
  const token = randomUUID();
  const path = `cmngrd/files/${randomUUID()}.${ext}`;
  const [copied] = await src.copy(bucket.file(path));
  await copied.setMetadata({
    cacheControl: "public,max-age=3600",
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return { url: downloadUrl(bucket.name, path, token), path };
}

/** Delete a stored object by the path returned from uploadAdminImage. */
export async function deleteAdminObject(path: string): Promise<void> {
  await getStorage(app).bucket().file(path).delete({ ignoreNotFound: true });
}

/** Serialize a firebase-admin Timestamp (or missing value) to epoch millis. */
export function toMillis(ts: unknown): number | null {
  if (ts && typeof (ts as { toMillis?: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}
