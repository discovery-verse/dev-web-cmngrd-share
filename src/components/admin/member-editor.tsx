"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/admin-api";
import type { EventDTO, MemberDTO } from "@/lib/api-types";
import { GROUP_LABELS, type MemberGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Modal } from "@/components/admin/ui";

/**
 * Edit a member: profile fields, contact, per-event approvals, plus ban, admin,
 * and delete. All writes go through /api/admin/members.
 */
export function MemberEditor({
  member,
  events,
  onClose,
  onChanged,
}: {
  member: MemberDTO;
  events: EventDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [title, setTitle] = useState(member.title);
  const [company, setCompany] = useState(member.company);
  const [groups, setGroups] = useState<MemberGroup[]>(member.groups);
  const [phone, setPhone] = useState(member.phone);
  const [linkedin, setLinkedin] = useState(member.linkedin);
  const [approved, setApproved] = useState<string[]>(member.events ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(id: string) {
    setApproved((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  function toggleGroup(g: MemberGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      api(`/api/admin/members/${member.uid}`, {
        method: "PATCH",
        body: { name, title, company, groups, events: approved, contact: { phone, linkedin } },
      }),
    );
  }

  return (
    <Modal title={member.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-[12px] text-faint">{member.email}</p>

        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Company">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </div>
        <div>
          <span className="text-[13px] font-semibold text-soft">Groups</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(GROUP_LABELS) as MemberGroup[]).map((g) => {
              const on = groups.includes(g);
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="LinkedIn">
            <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="text-[13px] font-semibold text-soft">Event access</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {events.length === 0 && <p className="text-[13px] text-faint">No events yet.</p>}
            {events.map((ev) => {
              const on = approved.includes(ev.id);
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
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>

      <div className="mt-5 space-y-2 border-t border-line pt-4">
        <p className="text-[13px] font-bold uppercase tracking-wide text-faint">Danger zone</p>
        <div className="flex flex-wrap gap-2">
          {member.banned ? (
            <Button type="button" variant="secondary" onClick={() => run(() => api(`/api/admin/members/${member.uid}/ban`, { method: "DELETE" }))}>
              Unban
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={() => run(() => api(`/api/admin/members/${member.uid}/ban`, { method: "PUT" }))}>
              Ban
            </Button>
          )}
          {member.admin ? (
            <Button type="button" variant="ghost" onClick={() => run(() => api(`/api/admin/members/${member.uid}/admin`, { method: "DELETE" }))}>
              Revoke admin
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => run(() => api(`/api/admin/members/${member.uid}/admin`, { method: "PUT" }))}>
              Make admin
            </Button>
          )}
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (window.confirm(`Delete ${member.name}'s profile? This can't be undone.`)) {
                run(() => api(`/api/admin/members/${member.uid}`, { method: "DELETE", body: { deleteAuthUser: false } }));
              }
            }}
          >
            Delete member
          </Button>
        </div>
      </div>
    </Modal>
  );
}
