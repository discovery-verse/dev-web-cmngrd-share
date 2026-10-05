"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  DoorOpen,
  Flag,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/higherground", label: "Dashboard", icon: LayoutDashboard },
  { href: "/higherground/members", label: "Members", icon: Users },
  { href: "/higherground/events", label: "Events", icon: CalendarDays },
  { href: "/higherground/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/higherground/media", label: "Media", icon: ImageIcon },
  { href: "/higherground/reports", label: "Reports", icon: Flag },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cg-brand-mark.svg" alt="Common Ground" className="h-20 w-auto" />
        <p className="mt-2 text-[13px] font-semibold text-soft">Higher Ground</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/higherground" ? pathname === "/higherground" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-clay-soft text-clay-deep" : "text-soft hover:bg-line/40",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-soft transition-colors hover:bg-line/40"
        >
          <ArrowLeft className="size-[18px]" aria-hidden />
          Back to app
        </Link>
        {user?.email && (
          <p className="truncate px-3 pt-1 text-[12px] text-faint" title={user.email}>
            {user.email}
          </p>
        )}
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-soft transition-colors hover:bg-line/40"
        >
          <LogOut className="size-[18px]" aria-hidden />
          Sign out
        </button>

        <div className="mt-3 flex flex-col gap-3 border-t border-line px-3 pt-4">
          <a
            href="https://www.digitalmissionventures.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-start gap-1 transition-opacity hover:opacity-80"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Owned by
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dmv-logo.png" alt="Digital Mission Ventures" className="h-6 w-auto" />
          </a>
          <a
            href="https://zavior.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-start gap-1 transition-opacity hover:opacity-80"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Powered by
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/zavior-logo.svg" alt="Zavior" className="h-4 w-auto" />
          </a>
        </div>
      </div>
    </aside>
  );
}
