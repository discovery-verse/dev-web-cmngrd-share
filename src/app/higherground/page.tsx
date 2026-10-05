"use client";

import Link from "next/link";
import { CalendarDays, DoorOpen, Flag, Users } from "lucide-react";
import { api, useApiData } from "@/lib/admin-api";
import type { EventDTO, StatsDTO } from "@/lib/api-types";
import { Card, LoadingScreen, PageHeader } from "@/components/admin/ui";

export default function DashboardPage() {
  const { data, error } = useApiData(async () => {
    const [{ stats }, { events }] = await Promise.all([
      api<{ stats: StatsDTO }>("/api/admin/stats"),
      api<{ events: EventDTO[] }>("/api/admin/events"),
    ]);
    return { stats, events };
  });

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <LoadingScreen />;
  const { stats, events } = data;

  const tiles = [
    { label: "Members", value: stats.members, icon: Users, href: "/higherground/members" },
    { label: "Events", value: stats.events, icon: CalendarDays, href: "/higherground/events" },
    { label: "Rooms", value: stats.rooms, icon: DoorOpen, href: "/higherground/rooms" },
    { label: "Open reports", value: stats.openReports, icon: Flag, href: "/higherground/reports" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Community at a glance." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-shadow hover:shadow-raised">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-soft">{label}</span>
                <Icon className="size-4 text-faint" aria-hidden />
              </div>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <PerEventCard title="Members by event" events={events} counts={stats.perEvent} />
        <PerEventCard title="Rooms by event" events={events} counts={stats.perEventRooms} />
      </div>
    </div>
  );
}

function PerEventCard({
  title,
  events,
  counts,
}: {
  title: string;
  events: EventDTO[];
  counts: Record<string, number>;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-faint">{title}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-soft">No events yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between text-sm">
              <span>{ev.name}</span>
              <span className="font-semibold">{counts[ev.id] ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
