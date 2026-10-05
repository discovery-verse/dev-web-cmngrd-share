"use client";

import { useRef, useState, type FormEvent } from "react";
import { Camera, Check, Copy, ImagePlus, Link as LinkIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, apiUpload, useApiData } from "@/lib/admin-api";
import { prepareImage, UploadError } from "@/lib/upload";
import type { EventDTO, EventImportDTO, MediaDTO } from "@/lib/api-types";
import { EventInfoEditor } from "@/components/admin/event-info-editor";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageHeader,
} from "@/components/admin/ui";

export default function EventsPage() {
  const { data: events, error, reload } = useApiData(() =>
    api<{ events: EventDTO[] }>("/api/admin/events").then((d) => d.events),
  );
  const [editing, setEditing] = useState<EventDTO | "new" | null>(null);

  async function remove(ev: EventDTO) {
    if (!window.confirm(`Delete event "${ev.name}"?`)) return;
    try {
      await api(`/api/admin/events/${ev.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      if (msg.includes("approved for this event") && window.confirm(`${msg}\n\nRemove the event and revoke those approvals?`)) {
        await api(`/api/admin/events/${ev.id}?force=1`, { method: "DELETE" });
        await reload();
      } else {
        window.alert(msg);
      }
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!events) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Sub-communities members can be approved into."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> New event
          </Button>
        }
      />

      {events.length === 0 ? (
        <EmptyState title="No events yet" body="Create your first event to start approving members." />
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{ev.name}</p>
                  <span className="rounded-full bg-clay-soft px-2 py-0.5 text-[11px] font-bold text-clay-deep">
                    {ev.shortName}
                  </span>
                  {!ev.allowSignups && (
                    <span className="rounded-full bg-line/60 px-2 py-0.5 text-[11px] font-bold text-soft">
                      Invite-only
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-faint">id: {ev.id} · order {ev.order}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing(ev)}
                  className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-line/40 hover:text-ink"
                  aria-label={`Edit ${ev.name}`}
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  onClick={() => remove(ev)}
                  className="flex size-9 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
                  aria-label={`Delete ${ev.name}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EventModal
          event={editing === "new" ? null : editing}
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

function EventModal({
  event,
  onClose,
  onSaved,
}: {
  event: EventDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id, setId] = useState(event?.id ?? "");
  const [idTouched, setIdTouched] = useState(false);
  const [name, setName] = useState(event?.name ?? "");
  const [shortName, setShortName] = useState(event?.shortName ?? "");
  const [order, setOrder] = useState(String(event?.order ?? 0));
  const [eventUrl, setEventUrl] = useState(event?.eventUrl ?? "");
  const [signupUrl, setSignupUrl] = useState(event?.signupUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(event?.logoUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(event?.coverUrl ?? "");
  const [dmRequiresConnection, setDmRequiresConnection] = useState(event?.dmRequiresConnection ?? false);
  // Default-on for new events; existing events reflect their stored value.
  const [allowSignups, setAllowSignups] = useState(event?.allowSignups ?? true);
  const [infoContent, setInfoContent] = useState(event?.infoContent ?? "");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importFromLink() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const { import: imported } = await api<{ import: EventImportDTO }>("/api/admin/events/import", {
        method: "POST",
        body: { url: importUrl },
      });
      if (!name) setName(imported.name);
      if (!eventUrl) setEventUrl(imported.eventUrl);
      if (!signupUrl) setSignupUrl(imported.signupUrl);
      if (!coverUrl && imported.coverUrl) setCoverUrl(imported.coverUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that link");
    } finally {
      setImporting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fields = { name, shortName, order: Number(order), eventUrl, signupUrl, logoUrl, coverUrl, dmRequiresConnection, allowSignups, infoContent };
      if (event) {
        await api(`/api/admin/events/${event.id}`, { method: "PATCH", body: fields });
      } else {
        await api("/api/admin/events", { method: "POST", body: { id, ...fields } });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ImageDropField
          label="Event logo (optional)"
          imageUrl={logoUrl}
          onChange={setLogoUrl}
          uploadName={`Event logo — ${name || "untitled"}`}
          previewClassName="h-24 w-full bg-line/20 object-contain"
        />
        <ImageDropField
          label="Event cover (optional)"
          imageUrl={coverUrl}
          onChange={setCoverUrl}
          uploadName={`Event cover — ${name || "untitled"}`}
          previewClassName="aspect-[14/5] w-full object-cover"
          hint="Looks best at 896 × 320 px — that's the shape it'll actually be cropped to below."
        />
        {(logoUrl || coverUrl) && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-soft">Preview — as shown on the sign-in page</p>
            <div className="mx-auto flex max-w-md flex-col items-center rounded-card border border-line bg-paper p-4">
              {coverUrl && (
                <div className="w-full overflow-hidden rounded-card shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host */}
                  <img src={coverUrl} alt="" className="h-40 w-full object-cover" />
                </div>
              )}
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host
                <img
                  src={logoUrl}
                  alt=""
                  className={`size-28 rounded-full border-4 border-paper bg-surface object-contain shadow-card ${
                    coverUrl ? "-mt-14" : ""
                  }`}
                />
              )}
            </div>
          </div>
        )}
        <Field label="Import from a link" hint="Paste a Luma (or other) event page to prefill the fields below.">
          <div className="flex gap-2">
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://lu.ma/your-event"
              className="flex-1"
            />
            <Button type="button" variant="ghost" onClick={importFromLink} loading={importing} disabled={!importUrl.trim()}>
              <LinkIcon className="size-4" aria-hidden /> Fetch
            </Button>
          </div>
        </Field>
        {!event && (
          <Field label="Event id" hint="Lowercase, e.g. summit. Permanent — can't be changed later.">
            <Input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setIdTouched(true);
              }}
              placeholder="summit"
              required
            />
          </Field>
        )}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual Community Summit" required />
        </Field>
        <Field label="Short name" hint="Shown on the switcher pill.">
          <Input
            value={shortName}
            onChange={(e) => {
              const next = e.target.value;
              setShortName(next);
              // Auto-fill the id from the short name (e.g. "Summit 2026" -> "summit-2026")
              // until the admin types into the id field themselves.
              if (!event && !idTouched) setId(slugify(next));
            }}
            placeholder="Summit"
            required
          />
        </Field>
        <Field label="Order" hint="Lower numbers appear first.">
          <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
        {event && <ShareableLinkField eventId={event.id} />}
        <Field label="Event link (optional)" hint="Public info page for the event.">
          <Input value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="lu.ma/your-event" />
        </Field>
        <Field label="Sign up link (optional)" hint="Where members go to register or RSVP.">
          <Input value={signupUrl} onChange={(e) => setSignupUrl(e.target.value)} placeholder="lu.ma/your-event" />
        </Field>

        <fieldset className="space-y-3 rounded-card border border-line p-4">
          <legend className="px-1 text-[13px] font-bold uppercase tracking-wide text-faint">Settings</legend>
          <SettingToggle
            label="Allow sign-ups"
            hint="When off, only members you add can get in — new people can't self-sign-up via this event's link."
            checked={allowSignups}
            onChange={setAllowSignups}
          />
          <SettingToggle
            label="DMs require a connection"
            hint="When on, members in this event can only message accepted connections."
            checked={dmRequiresConnection}
            onChange={setDmRequiresConnection}
          />
        </fieldset>

        <fieldset className="rounded-card border border-line p-4">
          <legend className="px-1 text-[13px] font-bold uppercase tracking-wide text-faint">Info page</legend>
          <EventInfoEditor value={infoContent} onChange={setInfoContent} />
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {event ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "Summit 2026" -> "summit-2026" — matches the server's id format (lowercase, letters/digits/hyphens). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** Labelled checkbox row for a per-event boolean setting. */
function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[13px] text-soft">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Read-only "copy the shareable per-event sign-in link" field, e.g. /summit/signin. */
function ShareableLinkField({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/${eventId}/signin` : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Field label="Shareable sign-in link" hint="Send this to invite people straight into this event.">
      <div className="flex gap-2">
        <Input value={url} readOnly onFocus={(e) => e.target.select()} className="flex-1" />
        <Button type="button" variant="ghost" onClick={copy}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden /> Copy
            </>
          )}
        </Button>
      </div>
    </Field>
  );
}

/** Downscale + upload one image to the media library; returns its public URL. */
async function uploadMedia(file: File, name: string): Promise<string> {
  const blob = await prepareImage(file, "cover");
  const form = new FormData();
  form.append("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
  form.append("name", name);
  const { media } = await apiUpload<{ media: MediaDTO }>("/api/admin/media", form);
  return media.url;
}

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/**
 * Image field styled like the Rooms cover picker: a full-width preview,
 * a paste-a-URL / media-library input, and an Upload button. The whole
 * preview / placeholder area is itself a drop target — click anywhere on it
 * to upload.
 */
function ImageDropField({
  label,
  hint,
  imageUrl,
  onChange,
  uploadName,
  previewClassName,
}: {
  label: string;
  hint?: string;
  imageUrl: string;
  onChange: (url: string) => void;
  uploadName: string;
  previewClassName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadMedia(file, uploadName));
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="relative mb-2 overflow-hidden rounded-xl border border-line">
        {/* The whole preview / placeholder uploads on click. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group block w-full"
          aria-label={`Upload ${label}`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage/arbitrary host
            <img src={imageUrl} alt="" className={`${previewClassName} ${uploading ? "opacity-60" : ""}`} />
          ) : (
            <div className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-line/20 text-soft">
              <ImagePlus className="size-6" aria-hidden />
              <span className="text-sm font-semibold">
                {uploading ? "Uploading…" : "Click to upload"}
              </span>
            </div>
          )}
          {imageUrl && !uploading && (
            <span className="pointer-events-none absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/45 text-sm font-semibold text-white group-hover:flex">
              <Camera className="size-4" aria-hidden /> Replace
            </span>
          )}
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/65"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={imageUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Upload, or paste a URL / Media library link"
          className="flex-1"
        />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-soft hover:border-faint">
          <ImagePlus className="size-4" aria-hidden />
          {uploading ? "Uploading…" : "Upload"}
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </Field>
  );
}
