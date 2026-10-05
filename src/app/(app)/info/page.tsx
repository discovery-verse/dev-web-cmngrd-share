"use client";

import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { useEvent } from "@/lib/event-context";
import { AwaitingAccess } from "@/components/event-switcher";
import { EmptyState, LoadingScreen } from "@/components/ui";
import { RichContent } from "@/components/rich-content";

/**
 * Member-facing event info / logistics page. Renders the Markdown an admin
 * authored on the current event (hotel, transport, contacts, …). Reached from
 * the info button in the top bar.
 */
export default function InfoPage() {
  const { allEvents, currentEvent } = useEvent();

  if (allEvents === null) return <LoadingScreen />;
  if (!currentEvent) return <AwaitingAccess />;

  const content = currentEvent.infoContent?.trim() ?? "";

  return (
    <div>
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Link
          href="/"
          aria-label="Back"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-soft hover:bg-line/40 hover:text-ink"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-tight">{currentEvent.name}</h1>
          <p className="text-sm text-soft">Event info &amp; logistics</p>
        </div>
      </header>

      {content ? (
        <div className="px-4 pb-10">
          <div className="rounded-card border border-line bg-surface p-5 shadow-card">
            <RichContent content={content} />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Info className="size-7" aria-hidden />}
          title="No info yet"
          body="The organisers haven't added event details here yet — check back soon."
        />
      )}
    </div>
  );
}
