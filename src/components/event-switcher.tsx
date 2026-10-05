"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Info,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  X,
} from "lucide-react";
import { useColumnWidth, type ColumnWidth } from "@/lib/width-context";
import { useEvent } from "@/lib/event-context";
import { cn } from "@/lib/utils";

/**
 * Top-bar pill showing the active event; tapping opens a sheet to switch
 * between the events this member has been approved for.
 */
export function EventSwitcher() {
  const { approvedEvents, currentEvent, switchEvent } = useEvent();
  const [open, setOpen] = useState(false);
  const hasInfo = Boolean(currentEvent?.infoContent?.trim());

  return (
    <>
      <div className="sticky top-0 z-40 flex h-12 items-center justify-center border-b border-line bg-paper/95 backdrop-blur">
        {hasInfo && (
          <Link
            href="/info"
            aria-label="Event info"
            title="Event info"
            className="absolute left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold text-clay hover:bg-clay-soft"
          >
            <Info className="size-4 shrink-0" aria-hidden />
            <span>Event Info</span>
          </Link>
        )}
        <button
          onClick={() => setOpen(true)}
          disabled={approvedEvents.length === 0}
          className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-surface px-4 py-1.5 text-[13px] font-bold shadow-card disabled:opacity-80"
        >
          <Sparkles className="size-3.5 shrink-0 text-clay" aria-hidden />
          <span className="truncate">
            {currentEvent ? currentEvent.shortName : "Awaiting event access"}
          </span>
          {approvedEvents.length > 1 && (
            <ChevronDown className="size-3.5 shrink-0 text-faint" aria-hidden />
          )}
        </button>
        <WidthToggle />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40"
          role="dialog"
          aria-modal="true"
          aria-label="Switch event"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-paper p-5 pb-safe shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Your events</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-line/50"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <ul className="space-y-2 pb-4">
              {approvedEvents.map((event) => {
                const active = event.id === currentEvent?.id;
                return (
                  <li key={event.id}>
                    <button
                      onClick={() => {
                        switchEvent(event.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-card border p-4 text-left",
                        active
                          ? "border-clay bg-clay-soft"
                          : "border-line bg-surface hover:border-faint",
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn("font-bold", active && "text-clay-deep")}>
                          {event.name}
                        </p>
                        <p className="text-[13px] text-soft">{event.shortName}</p>
                      </div>
                      {active && <Check className="size-5 shrink-0 text-clay" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="pb-3 text-center text-[12px] text-faint">
              People, Ideas, and Rooms show the selected event. Chats and
              connections stay with you across events.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

const WIDTH_OPTIONS: { value: ColumnWidth; label: string; icon: typeof RectangleVertical }[] = [
  { value: "narrow", label: "Narrow column", icon: RectangleVertical },
  { value: "wide", label: "Wide column", icon: RectangleHorizontal },
];

/**
 * Desktop-only (hidden below lg — that breakpoint is also what applies the
 * width classes) segmented control switching the app column between the
 * phone-width narrow layout and a wide layout that uses the big screen.
 */
function WidthToggle() {
  const { width, setWidth } = useColumnWidth();
  return (
    <div
      role="group"
      aria-label="Column width"
      className="absolute right-3 hidden rounded-full border border-line bg-surface p-0.5 lg:flex"
    >
      {WIDTH_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setWidth(value)}
          aria-label={label}
          title={label}
          aria-pressed={width === value}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-colors",
            width === value ? "bg-ink text-white" : "text-faint hover:text-soft",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Friendly gate shown on event-scoped tabs while awaiting admin approval. */
export function AwaitingAccess() {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
      <Sparkles className="size-8 text-clay" aria-hidden />
      <p className="font-semibold">You&apos;re in — almost there</p>
      <p className="max-w-xs text-sm leading-relaxed text-soft">
        An admin needs to add you to an event before you can see its people,
        ideas, and rooms. You&apos;ll be in as soon as they approve you.
      </p>
    </div>
  );
}
