"use client";

import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** "I'll be attending" toggle for a room. Lives inside link cards, so it
 *  swallows the click instead of navigating. */
export function AttendButton({
  on,
  count,
  onToggle,
  countClass,
  className,
  invite,
}: {
  on: boolean;
  count: number;
  onToggle: () => void;
  /** Size override for the count, e.g. to match a card's title size. */
  countClass?: string;
  /** Layout overrides, e.g. w-full to span a board column. */
  className?: string;
  /** Append a soft "tap to RSVP" nudge while the viewer hasn't RSVPed. */
  invite?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
        on
          ? "bg-clay text-white"
          : "border border-dashed border-line text-faint hover:border-clay hover:text-clay",
        className,
      )}
    >
      <CalendarCheck className="size-3.5" aria-hidden />
      {on ? "Attending" : "I'll attend"}
      {!on && invite && <span className="font-normal opacity-75">· tap to RSVP</span>}
      {count > 0 && (
        <span className={cn("font-semibold", on ? "text-white/80" : "text-soft", countClass)}>
          {count}
        </span>
      )}
    </button>
  );
}
