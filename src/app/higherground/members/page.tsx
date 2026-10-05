"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Search, Upload } from "lucide-react";
import { api, useApiData } from "@/lib/admin-api";
import type { EventDTO, MemberDTO } from "@/lib/api-types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  GroupChip,
  Input,
  LoadingScreen,
  PageHeader,
  Select,
} from "@/components/admin/ui";
import { MemberEditor } from "@/components/admin/member-editor";
import { BulkMemberActions } from "@/components/admin/bulk-member-actions";

type SortMode = "name" | "recent" | "company" | "events" | "awaiting";

export default function MembersPage() {
  const { data, error, reload } = useApiData(async () => {
    const [{ members }, { events }] = await Promise.all([
      api<{ members: MemberDTO[] }>("/api/admin/members"),
      api<{ events: EventDTO[] }>("/api/admin/events"),
    ]);
    return { members, events };
  });
  const members = data?.members ?? null;
  const events = data?.events ?? [];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [editing, setEditing] = useState<MemberDTO | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.company.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q),
        )
      : [...members];
    // The API already returns name order; the others re-sort locally, with
    // name order as the stable tie-break.
    switch (sort) {
      case "recent":
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        break;
      case "company":
        list.sort((a, b) => {
          if (!a.company || !b.company) return Number(!a.company) - Number(!b.company);
          return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
        });
        break;
      case "events":
        list.sort((a, b) => (b.events?.length ?? 0) - (a.events?.length ?? 0));
        break;
      case "awaiting":
        list.sort(
          (a, b) => Number((b.events?.length ?? 0) === 0) - Number((a.events?.length ?? 0) === 0),
        );
        break;
    }
    return list;
  }, [members, search, sort]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.uid));

  function toggleSelected(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach((m) => next.delete(m.uid));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((m) => next.add(m.uid));
      return next;
    });
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!members) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} in the community`}
        action={
          <Link href="/higherground/members/import">
            <Button>
              <Upload className="size-4" aria-hidden /> Bulk add
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, or email"
            className="pl-10"
          />
        </div>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort members"
          className="w-auto shrink-0"
        >
          <option value="name">Name A–Z</option>
          <option value="recent">Recently added</option>
          <option value="company">Company A–Z</option>
          <option value="events">Most events</option>
          <option value="awaiting">Awaiting first</option>
        </Select>
      </div>

      {filtered.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-soft">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
              className="size-4 rounded border-line"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                <Layers className="size-4" aria-hidden /> Bulk actions
              </Button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No members found" body="Try a different search, or bulk add people." />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <Card key={m.uid} className="flex items-center gap-4 py-3.5">
              <input
                type="checkbox"
                checked={selected.has(m.uid)}
                onChange={() => toggleSelected(m.uid)}
                aria-label={`Select ${m.name}`}
                className="size-4 shrink-0 rounded border-line"
              />
              <Avatar name={m.name} uid={m.uid} />
              <button onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left" aria-label={`Edit ${m.name}`}>
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{m.name}</p>
                  {m.admin && <Badge tone="sky">Admin</Badge>}
                  {m.banned && <Badge tone="danger">Banned</Badge>}
                  {(m.events?.length ?? 0) === 0 && <Badge tone="amber">Awaiting</Badge>}
                </div>
                <p className="truncate text-[13px] text-soft">
                  {[m.title, m.company].filter(Boolean).join(" · ") || m.email}
                </p>
              </button>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <GroupChip groups={m.groups} />
                <span className="text-[12px] text-faint">
                  {m.events?.length ?? 0} event{(m.events?.length ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <MemberEditor
          member={editing}
          events={events}
          onClose={() => setEditing(null)}
          onChanged={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      {bulkOpen && (
        <BulkMemberActions
          memberUids={[...selected]}
          events={events}
          onClose={() => setBulkOpen(false)}
          onApplied={async () => {
            setBulkOpen(false);
            setSelected(new Set());
            await reload();
          }}
        />
      )}
    </div>
  );
}
