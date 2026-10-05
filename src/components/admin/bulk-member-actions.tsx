"use client";

import { useState } from "react";
import { api } from "@/lib/admin-api";
import type { EventDTO } from "@/lib/api-types";
import { GROUP_LABELS, type MemberGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Modal } from "@/components/admin/ui";

type Mode = "add" | "remove";

const CHUNK = 20;

/**
 * Bulk-tag a set of members with group(s) and/or event access. Each pick
 * list is additive/subtractive (arrayUnion / arrayRemove server-side), so
 * this never clobbers a member's existing groups or events — only the admin
 * console's single-member editor does full replacement.
 */
export function BulkMemberActions({
  memberUids,
  events,
  onClose,
  onApplied,
}: {
  memberUids: string[];
  events: EventDTO[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [groupMode, setGroupMode] = useState<Mode>("add");
  const [groupPicks, setGroupPicks] = useState<MemberGroup[]>([]);
  const [eventMode, setEventMode] = useState<Mode>("add");
  const [eventPicks, setEventPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleGroup(g: MemberGroup) {
    setGroupPicks((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }
  function toggleEvent(id: string) {
    setEventPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const hasChanges = groupPicks.length > 0 || eventPicks.length > 0;

  async function apply() {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: memberUids.length });
    try {
      const body: Record<string, unknown> = {};
      if (groupPicks.length) body[groupMode === "add" ? "groupsAdd" : "groupsRemove"] = groupPicks;
      if (eventPicks.length) body[eventMode === "add" ? "eventsAdd" : "eventsRemove"] = eventPicks;

      for (let i = 0; i < memberUids.length; i += CHUNK) {
        const chunk = memberUids.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map((uid) => api(`/api/admin/members/${uid}`, { method: "PATCH", body })),
        );
        setProgress({ done: Math.min(i + CHUNK, memberUids.length), total: memberUids.length });
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed — some members may be unchanged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Bulk actions — ${memberUids.length} member${memberUids.length === 1 ? "" : "s"}`} onClose={onClose}>
      <div className="space-y-5">
        <ModeSection
          label="Groups"
          mode={groupMode}
          setMode={setGroupMode}
          addLabel="Add to group(s)"
          removeLabel="Remove from group(s)"
        >
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(GROUP_LABELS) as MemberGroup[]).map((g) => {
              const on = groupPicks.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGroup(g)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    on
                      ? "bg-clay-soft text-clay-deep"
                      : "border border-dashed border-line text-faint hover:border-faint hover:text-soft",
                  )}
                >
                  {on ? "✓ " : "+ "}
                  {GROUP_LABELS[g]}
                </button>
              );
            })}
          </div>
        </ModeSection>

        <ModeSection
          label="Event access"
          mode={eventMode}
          setMode={setEventMode}
          addLabel="Grant event access"
          removeLabel="Revoke event access"
        >
          {events.length === 0 ? (
            <p className="text-[13px] text-faint">No events yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {events.map((ev) => {
                const on = eventPicks.includes(ev.id);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEvent(ev.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                      on
                        ? "bg-sage-soft text-sage"
                        : "border border-dashed border-line text-faint hover:border-faint hover:text-soft",
                    )}
                  >
                    {on ? "✓ " : "+ "}
                    {ev.shortName}
                  </button>
                );
              })}
            </div>
          )}
        </ModeSection>

        {progress && busy && (
          <p className="text-[12px] text-faint">
            Applying… {progress.done}/{progress.total}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" loading={busy} disabled={!hasChanges} onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModeSection({
  label,
  mode,
  setMode,
  addLabel,
  removeLabel,
  children,
}: {
  label: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  addLabel: string;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-soft">{label}</span>
        <div className="flex gap-1 rounded-full border border-line bg-surface p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={cn(
              "rounded-full px-2.5 py-1 font-semibold transition-colors",
              mode === "add" ? "bg-sage-soft text-sage" : "text-faint hover:text-soft",
            )}
          >
            {addLabel}
          </button>
          <button
            type="button"
            onClick={() => setMode("remove")}
            className={cn(
              "rounded-full px-2.5 py-1 font-semibold transition-colors",
              mode === "remove" ? "bg-danger-soft text-danger" : "text-faint hover:text-soft",
            )}
          >
            {removeLabel}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
