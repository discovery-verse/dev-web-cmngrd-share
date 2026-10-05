"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { CircleUserRound, Lightbulb, MessagesSquare, Users, DoorOpen } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useColumnWidth } from "@/lib/width-context";
import { cn } from "@/lib/utils";
import type { Thread } from "@/lib/types";

/** Live count of DM threads whose last message I haven't seen. */
function useUnreadThreads(uid: string | undefined): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "threads"), where("participants", "array-contains", uid));
    return onSnapshot(q, (snap) => {
      let unread = 0;
      snap.forEach((docSnap) => {
        const t = docSnap.data() as Thread;
        if (!t.lastMessageAt || t.lastSenderId === uid) return;
        const readAt = t.reads?.[uid];
        if (!readAt || readAt.toMillis() < t.lastMessageAt.toMillis()) unread++;
      });
      setCount(unread);
    });
  }, [uid]);
  return count;
}

const TABS = [
  { href: "/", label: "People", icon: Users },
  { href: "/board", label: "Boards", icon: Lightbulb },
  { href: "/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/messages", label: "Chats", icon: MessagesSquare },
  { href: "/me", label: "Me", icon: CircleUserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { columnWidth } = useColumnWidth();
  const unread = useUnreadThreads(user?.uid);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe"
    >
      {/* The tab row tracks the app column's width on desktop. */}
      <div className={cn("mx-auto flex w-full max-w-lg items-stretch", columnWidth)}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const showBadge = href === "/messages" && unread > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-clay" : "text-faint hover:text-soft",
              )}
            >
              <span className="relative">
                <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {showBadge && (
                  <span
                    aria-label={`${unread} unread conversations`}
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-bold text-white"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
