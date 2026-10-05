"use client";

import { Plus, X } from "lucide-react";
import { LINK_TYPES, LINK_TYPE_LABELS, MAX_LINKS, type LinkType, type ProfileLink } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Editable list of member links (website / projects / social). Each row is a
 * category picker + a URL field; up to MAX_LINKS rows in any mix. Controlled —
 * the parent owns the array and persists it (into the private contact card, so
 * links are shared only with accepted connections).
 */
export function LinksEditor({
  links,
  onChange,
}: {
  links: ProfileLink[];
  onChange: (next: ProfileLink[]) => void;
}) {
  function update(i: number, patch: Partial<ProfileLink>) {
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    onChange(links.filter((_, idx) => idx !== i));
  }
  function add() {
    if (links.length >= MAX_LINKS) return;
    onChange([...links, { type: "website", url: "" }]);
  }

  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={link.type}
            onChange={(e) => update(i, { type: e.target.value as LinkType })}
            aria-label="Link type"
            className="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-3 text-[14px] font-medium text-ink focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15"
          >
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {LINK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={link.url}
            onChange={(e) => update(i, { url: e.target.value })}
            type="text"
            inputMode="url"
            placeholder="zavior.ai"
            aria-label={`${LINK_TYPE_LABELS[link.type]} URL`}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3 text-[15px] text-ink placeholder:text-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove link"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={links.length >= MAX_LINKS}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] font-semibold text-clay transition-colors hover:bg-clay-soft disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        <Plus className="size-4" aria-hidden />
        Add link
      </button>
      {links.length >= MAX_LINKS && (
        <p className="text-[12px] text-faint">You&apos;ve reached the {MAX_LINKS}-link limit.</p>
      )}
    </div>
  );
}
