"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, DoorOpen, Eye, EyeOff, FileText, ImagePlus, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, apiUpload, useApiData } from "@/lib/admin-api";
import { prepareImage, UploadError } from "@/lib/upload";
import { formatBytes, groupRoomsByDay, roomDayLabel, roomScheduleLabel } from "@/lib/utils";
import type { RoomFile, RoomPerson } from "@/lib/types";
import type { EventDTO, MediaDTO, MemberDTO, RoomDTO } from "@/lib/api-types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FieldGroup,
  Input,
  LoadingScreen,
  Modal,
  PageHeader,
  Select,
} from "@/components/admin/ui";

export default function RoomsPage() {
  const { data, error, reload } = useApiData(async () => {
    const [{ rooms }, { events }] = await Promise.all([
      api<{ rooms: RoomDTO[] }>("/api/admin/rooms"),
      api<{ events: EventDTO[] }>("/api/admin/events"),
    ]);
    return { rooms, events };
  });
  const rooms = data?.rooms ?? null;
  const events = data?.events ?? [];
  const [editing, setEditing] = useState<RoomDTO | "new" | null>(null);

  async function remove(room: RoomDTO) {
    if (!window.confirm(`Close and delete "${room.name}"? Its messages will be removed too.`)) return;
    await api(`/api/admin/rooms/${room.id}`, { method: "DELETE" });
    await reload();
  }

  async function toggleHidden(room: RoomDTO) {
    await api(`/api/admin/rooms/${room.id}`, { method: "PATCH", body: { hidden: !room.hidden } });
    await reload();
  }

  async function duplicate(room: RoomDTO) {
    await api(`/api/admin/rooms/${room.id}/duplicate`, { method: "POST" });
    await reload();
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!rooms) return <LoadingScreen />;

  const byEvent = events.map((ev) => ({ event: ev, rooms: rooms.filter((r) => r.eventId === ev.id) }));
  const orphaned = rooms.filter((r) => !events.some((e) => e.id === r.eventId));

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle="Live discussion rooms, grouped by event."
        action={
          <Button onClick={() => setEditing("new")} disabled={events.length === 0}>
            <Plus className="size-4" aria-hidden /> New room
          </Button>
        }
      />

      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          body={events.length === 0 ? "Create an event first, then add rooms to it." : "Create your first room."}
        />
      ) : (
        <div className="space-y-6">
          {byEvent.map(({ event, rooms }) => (
            <section key={event.id}>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-faint">
                {event.name}
                <span className="rounded-full bg-line/60 px-2 py-0.5 text-[11px] text-soft">{rooms.length}</span>
              </h2>
              {rooms.length === 0 ? (
                <p className="text-[13px] text-faint">No rooms in this event.</p>
              ) : (
                <DayGroupedRows
                  rooms={rooms}
                  onEdit={setEditing}
                  onDelete={remove}
                  onToggleHidden={toggleHidden}
                  onDuplicate={duplicate}
                />
              )}
            </section>
          ))}

          {orphaned.length > 0 && (
            <section>
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-danger">Orphaned (event deleted)</h2>
              <DayGroupedRows
                rooms={orphaned}
                onEdit={setEditing}
                onDelete={remove}
                onToggleHidden={toggleHidden}
                onDuplicate={duplicate}
              />
            </section>
          )}
        </div>
      )}

      {editing && (
        <RoomModal
          room={editing === "new" ? null : editing}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** Rooms of one event, sub-grouped by agenda day (undated rooms last). The
 *  day headings are skipped when nothing in the event is dated yet. */
function DayGroupedRows({
  rooms,
  onEdit,
  onDelete,
  onToggleHidden,
  onDuplicate,
}: {
  rooms: RoomDTO[];
  onEdit: (room: RoomDTO) => void;
  onDelete: (room: RoomDTO) => void;
  onToggleHidden: (room: RoomDTO) => void;
  onDuplicate: (room: RoomDTO) => void;
}) {
  const groups = groupRoomsByDay(rooms);
  const showDayHeaders = !(groups.length === 1 && groups[0].date === "");
  return (
    <div className="space-y-3">
      {groups.map(({ date, rooms: dayRooms }) => (
        <div key={date || "anytime"}>
          {showDayHeaders && (
            <h3 className="mb-1.5 text-[12px] font-semibold text-soft">
              {date ? roomDayLabel(date) : "Anytime"}
            </h3>
          )}
          <div className="space-y-2">
            {dayRooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                onEdit={() => onEdit(room)}
                onDelete={() => onDelete(room)}
                onToggleHidden={() => onToggleHidden(room)}
                onDuplicate={() => onDuplicate(room)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomRow({
  room,
  onEdit,
  onDelete,
  onToggleHidden,
  onDuplicate,
}: {
  room: RoomDTO;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onDuplicate: () => void;
}) {
  const schedule = roomScheduleLabel(room, { withDate: false });
  return (
    <Card className="flex items-center gap-4 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay-deep">
        <DoorOpen className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-semibold">{room.name}</span>
          {room.hidden && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-line/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-soft">
              <EyeOff className="size-3" aria-hidden />
              Hidden
            </span>
          )}
        </p>
        {room.topic && <p className="truncate text-[13px] text-soft">{room.topic}</p>}
        {(schedule || room.people.length > 0 || room.files.length > 0) && (
          <p className="truncate text-[12px] text-faint">
            {[
              schedule,
              room.people.length > 0 &&
                room.people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(", "),
              room.files.length > 0 && `${room.files.length} download${room.files.length === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {room.rsvps.length > 0 && (
          <p
            className="truncate text-[12px] font-semibold text-sage"
            title={room.rsvps.map((r) => r.name).join(", ")}
          >
            {room.rsvps.length} attending · {room.rsvps.map((r) => r.name).join(", ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={onToggleHidden}
          className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-line/40 hover:text-ink"
          aria-label={room.hidden ? `Reveal ${room.name} to members` : `Hide ${room.name} from members`}
          title={room.hidden ? "Reveal to members" : "Hide from members"}
        >
          {room.hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        </button>
        <button
          onClick={onDuplicate}
          className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-line/40 hover:text-ink"
          aria-label={`Duplicate ${room.name}`}
          title="Duplicate (copy starts hidden)"
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <button
          onClick={onEdit}
          className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-line/40 hover:text-ink"
          aria-label={`Edit ${room.name}`}
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          onClick={onDelete}
          className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
          aria-label={`Delete ${room.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </Card>
  );
}

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,image/jpeg,image/png,image/webp,image/gif";

function RoomModal({
  room,
  events,
  onClose,
  onSaved,
}: {
  room: RoomDTO | null;
  events: EventDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [eventId, setEventId] = useState(room?.eventId ?? events[0]?.id ?? "");
  const [name, setName] = useState(room?.name ?? "");
  const [topic, setTopic] = useState(room?.topic ?? "");
  const [imageUrl, setImageUrl] = useState(room?.imageUrl ?? "");
  const [date, setDate] = useState(room?.date ?? "");
  const [startTime, setStartTime] = useState(room?.startTime ?? "");
  const [endTime, setEndTime] = useState(room?.endTime ?? "");
  const [location, setLocation] = useState(room?.location ?? "");
  const [link, setLink] = useState(room?.link ?? "");
  const [linkLabel, setLinkLabel] = useState(room?.linkLabel ?? "");
  const [order, setOrder] = useState(String(room?.order ?? 0));
  // New rooms start hidden so the admin can stage them and reveal when ready.
  const [hidden, setHidden] = useState(room ? room.hidden : true);
  const [people, setPeople] = useState<RoomPerson[]>(room?.people ?? []);
  const [files, setFiles] = useState<RoomFile[]>(room?.files ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // People picker: members approved for the selected event. Keyed by event id
  // so switching events shows "Loading…" instead of the previous event's list.
  const [memberState, setMemberState] = useState<{ eventId: string; members: MemberDTO[] }>();
  const members = memberState?.eventId === eventId ? memberState.members : null;
  const [personUid, setPersonUid] = useState("");
  const [personRole, setPersonRole] = useState("Speaker");

  useEffect(() => {
    let cancelled = false;
    if (!eventId) return;
    api<{ members: MemberDTO[] }>(`/api/admin/members?event=${encodeURIComponent(eventId)}`)
      .then(({ members }) => !cancelled && setMemberState({ eventId, members }))
      .catch(() => !cancelled && setMemberState({ eventId, members: [] }));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function addPerson() {
    const m = members?.find((x) => x.uid === personUid);
    if (!m || people.some((p) => p.uid === m.uid)) return;
    setPeople([...people, { uid: m.uid, name: m.name, role: personRole.trim() }]);
    setPersonUid("");
  }

  // Upload a cover into the shared media library and point this room at it.
  async function uploadCover(file: File) {
    setUploading(true);
    setError(null);
    try {
      const blob = await prepareImage(file, "cover");
      const form = new FormData();
      form.append("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
      form.append("name", `Room cover — ${name || "untitled"}`);
      const { media } = await apiUpload<{ media: MediaDTO }>("/api/admin/media", form);
      setImageUrl(media.url);
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadDownload(file: File) {
    setUploadingFile(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { file: uploaded } = await apiUpload<{ file: RoomFile }>("/api/admin/files", form);
      setFiles((prev) => [...prev, uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setUploadingFile(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      eventId,
      name,
      topic,
      imageUrl,
      date,
      startTime,
      endTime,
      location,
      link,
      linkLabel,
      order: Number(order) || 0,
      hidden,
      people,
      files,
    };
    try {
      if (room) {
        await api(`/api/admin/rooms/${room.id}`, { method: "PATCH", body });
      } else {
        await api("/api/admin/rooms", { method: "POST", body });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <Modal title={room ? "Edit room" : "New room"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Event">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Room name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Founders × Funders" required />
        </Field>
        <Field label="Topic (optional)">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this room about?" />
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Starts">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Location (optional)">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hall B, Level 3" />
            </Field>
          </div>
          <Field label="Order" hint="Lower numbers appear first.">
            <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Link (optional)" hint="Members get a button to open this.">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="chat.whatsapp.com/… or a sign-up form"
              />
            </Field>
          </div>
          <Field label="Link button text">
            <Input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Join the chat"
            />
          </Field>
        </div>

        <label className="flex items-start justify-between gap-4 rounded-xl border border-line bg-paper px-3 py-2.5">
          <span>
            <span className="block text-sm font-semibold">Hidden from members</span>
            <span className="block text-[13px] text-soft">
              Stage the room now, reveal it in your own time — members won&apos;t see it until you untick
              this (or hit the reveal button in the list).
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
        </label>

        <FieldGroup label="Featured people (optional)" hint="Spotlight the speaker, moderator, or host on the room.">
          <div className="space-y-2">
            {people.length > 0 && (
              <ul className="space-y-1.5">
                {people.map((p) => (
                  <li
                    key={p.uid}
                    className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{p.name}</span>
                      {p.role && <span className="text-soft"> — {p.role}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPeople(people.filter((x) => x.uid !== p.uid))}
                      aria-label={`Remove ${p.name}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Select
                value={personUid}
                onChange={(e) => setPersonUid(e.target.value)}
                className="min-w-0 flex-1"
                disabled={members === null}
              >
                <option value="">
                  {members === null ? "Loading members…" : members.length === 0 ? "No members in this event" : "Pick a member…"}
                </option>
                {(members ?? [])
                  .filter((m) => !people.some((p) => p.uid === m.uid))
                  .map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.name}
                      {m.company ? ` — ${m.company}` : ""}
                    </option>
                  ))}
              </Select>
              <Input
                value={personRole}
                onChange={(e) => setPersonRole(e.target.value)}
                placeholder="Role"
                className="w-32 shrink-0"
                aria-label="Role, e.g. Speaker or Moderator"
              />
              <Button type="button" variant="secondary" onClick={addPerson} disabled={!personUid}>
                Add
              </Button>
            </div>
          </div>
        </FieldGroup>

        <FieldGroup label="Downloads (optional)" hint="Slides, worksheets, and other files members can download.">
          <div className="space-y-2">
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li
                    key={f.path || f.url}
                    className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                  >
                    <FileText className="size-4 shrink-0 text-clay" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                    {f.size > 0 && <span className="shrink-0 text-[12px] text-faint">{formatBytes(f.size)}</span>}
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((x) => x !== f))}
                      aria-label={`Remove ${f.name}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-soft hover:border-faint">
              <Paperclip className="size-4" aria-hidden />
              {uploadingFile ? "Uploading…" : "Add file"}
              <input
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                disabled={uploadingFile}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadDownload(file);
                }}
              />
            </label>
          </div>
        </FieldGroup>

        <Field label="Cover image (optional)">
          {imageUrl && (
            <div className="relative mb-2 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host */}
              <img src={imageUrl} alt="" className="h-32 w-full object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl("")}
                aria-label="Remove cover"
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/65"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Upload, or paste a URL / Media library link"
              className="flex-1"
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-soft hover:border-faint">
              <ImagePlus className="size-4" aria-hidden />
              {uploading ? "Uploading…" : "Upload"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadCover(file);
                }}
              />
            </label>
          </div>
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {room ? "Save" : hidden ? "Create hidden room" : "Open room"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
