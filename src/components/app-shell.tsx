"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { WidthProvider, useColumnWidth } from "@/lib/width-context";
import { EventProvider } from "@/lib/event-context";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/ui";
import { BottomNav } from "@/components/bottom-nav";
import { EventSwitcher } from "@/components/event-switcher";
import { ProfileSetup } from "@/components/profile-setup";

/**
 * Auth guard for everything inside the (app) route group.
 * No member data renders (or is even subscribed to) until Firebase Auth
 * confirms a signed-in user; Firestore rules enforce the same server-side.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, member } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace("/signin");
  }, [user, router]);

  if (user === undefined || user === null || member === undefined) {
    return <LoadingScreen />;
  }

  // Signed in but no profile yet → lightweight onboarding, then the app.
  if (member === null) {
    return <ProfileSetup />;
  }

  return (
    <EventProvider>
      <WidthProvider>
        <ShellFrame>{children}</ShellFrame>
      </WidthProvider>
    </EventProvider>
  );
}

/** The app column; on desktop it runs narrow / wide per the header toggle. */
function ShellFrame({ children }: { children: ReactNode }) {
  const { columnWidth } = useColumnWidth();
  return (
    <div className={cn("@container mx-auto flex min-h-dvh w-full max-w-lg flex-col pt-safe", columnWidth)}>
      <EventSwitcher />
      <main className="flex-1 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
