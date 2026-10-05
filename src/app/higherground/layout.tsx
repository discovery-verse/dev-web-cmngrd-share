"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/admin-api";
import { AdminLogin } from "@/components/admin/login";
import { Sidebar } from "@/components/admin/sidebar";
import { LoadingScreen } from "@/components/admin/ui";

/**
 * Guards the whole console. Signed-out visitors see the login. Signed-in
 * visitors are confirmed against the server (/api/admin/me verifies the ID
 * token + admins doc) — authoritative and free of the client snapshot's
 * post-sign-in lag. Non-admins get the login's dead-end branch.
 */
export default function HigherGroundLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Keyed by uid so a previous account's result never leaks across a switch.
  const [adminFor, setAdminFor] = useState<{ uid: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api("/api/admin/me")
      .then(() => active && setAdminFor({ uid: user.uid, ok: true }))
      .catch(() => active && setAdminFor({ uid: user.uid, ok: false }));
    return () => {
      active = false;
    };
  }, [user]);

  if (user === undefined) return <LoadingScreen />;
  if (user === null) return <AdminLogin />;
  const resolved = adminFor?.uid === user.uid;
  if (!resolved) return <LoadingScreen label="Checking access…" />;
  if (!adminFor.ok) return <AdminLogin />;

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden px-8 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
