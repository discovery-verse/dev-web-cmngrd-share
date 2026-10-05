"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { useAppConfig } from "@/lib/config";
import { normalizeMember, type AppConfig, type Member } from "@/lib/types";
import { SetupNotice } from "@/components/setup-notice";

interface AuthState {
  /** undefined = still resolving; null = signed out. */
  user: User | null | undefined;
  /** undefined = still loading; null = signed in but no profile yet (needs onboarding). */
  member: Member | null | undefined;
  isAdmin: boolean;
  config: AppConfig;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // Keyed by uid so a stale profile never leaks across a sign-out/sign-in.
  const [memberState, setMemberState] = useState<{ uid: string; member: Member | null }>();
  const [adminState, setAdminState] = useState<{ uid: string; isAdmin: boolean }>();
  const config = useAppConfig(!!user);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const unsubMember = onSnapshot(
      doc(db, "members", uid),
      (snap) => {
        setMemberState({
          uid,
          member: snap.exists() ? normalizeMember(snap.id, snap.data()) : null,
        });
      },
      // A transient permission-denied can arrive during the auth-token handoff
      // or sign-out teardown (request.auth momentarily null → fails signedIn()).
      // The effect cleanup unsubscribes this listener anyway, so treat it as
      // "no profile resolved" rather than surface an uncaught listener error.
      () => setMemberState({ uid, member: null }),
    );
    // Rules allow each user to `get` only their own admins/{uid} doc.
    const unsubAdmin = onSnapshot(
      doc(db, "admins", uid),
      (snap) => setAdminState({ uid, isAdmin: snap.exists() }),
      () => setAdminState({ uid, isAdmin: false }),
    );
    return () => {
      unsubMember();
      unsubAdmin();
    };
  }, [user]);

  const member =
    user === undefined
      ? undefined
      : user === null
        ? null
        : memberState?.uid === user.uid
          ? memberState.member
          : undefined;
  const isAdmin = !!user && adminState?.uid === user.uid && adminState.isAdmin;

  const signOut = async () => {
    await fbSignOut(auth);
  };

  if (!firebaseConfigured) return <SetupNotice />;

  return (
    <AuthContext.Provider value={{ user, member, isAdmin, config, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
