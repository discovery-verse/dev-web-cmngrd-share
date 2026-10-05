import "server-only";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/server/admin";

export interface AdminSession {
  uid: string;
  email: string | undefined;
}

/** Thrown by requireAdmin; carries the HTTP status to return. */
export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Verify the caller's Firebase ID token (sent as `Authorization: Bearer <token>`
 * by the admin client) and confirm the uid is in the admins collection. Every
 * /api/admin route calls this first. Throws AuthError(401) if unauthenticated,
 * AuthError(403) if signed in but not an admin.
 *
 * Bearer tokens (not a session cookie): the console already holds a live
 * Firebase auth session via AuthProvider, so the client attaches a fresh ID
 * token per request. verifyIdToken needs no elevated IAM (unlike session
 * cookies), and works against the Auth emulator when its host env is set.
 */
export async function requireAdmin(req: Request): Promise<AdminSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AuthError(401, "Not signed in");

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    throw new AuthError(401, "Session expired");
  }

  const adminDoc = await adminDb.doc(`admins/${uid}`).get();
  if (!adminDoc.exists) throw new AuthError(403, "Not an admin");

  return { uid, email };
}

/**
 * Verify the caller's Firebase ID token without requiring admin. For member-
 * facing routes (e.g. self-serve onboarding) that still need a trusted uid/email
 * server-side. Throws AuthError(401) if unauthenticated.
 */
export async function requireAuth(req: Request): Promise<AdminSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AuthError(401, "Not signed in");

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    throw new AuthError(401, "Session expired");
  }
}

/**
 * Turn a thrown error into a clean JSON response. Preserves AuthError status
 * (401/403); anything else becomes 400 with its message.
 */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "Server error";
  return NextResponse.json({ error: message }, { status: 400 });
}
