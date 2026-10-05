"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileUp } from "lucide-react";
import { api } from "@/lib/admin-api";
import {
  buildImportRows,
  guessMapping,
  IMPORT_FIELDS,
  parseRawCsvFile,
  parseRawPasted,
  rowsToCsv,
  templateCsv,
  type RawTable,
} from "@/lib/parse-import";
import type {
  CommitResult,
  EventDTO,
  ImportPolicy,
  ImportRow,
  RowVerdict,
} from "@/lib/api-types";
import { parseEventIds } from "@/lib/admin-utils";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { GROUP_LABELS, type MemberGroup } from "@/lib/types";

type Tab = "csv" | "paste" | "single";
type Stage = "input" | "mapping" | "preview" | "done";

const CHUNK = 50;

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("csv");
  const [stage, setStage] = useState<Stage>("input");
  const [table, setTable] = useState<RawTable | null>(null);
  const [mapping, setMapping] = useState<(keyof ImportRow | "")[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [verdicts, setVerdicts] = useState<RowVerdict[]>([]);
  const [results, setResults] = useState<CommitResult[]>([]);
  const [policy, setPolicy] = useState<ImportPolicy>({ existing: "update", unbanOnImport: false });
  const [bulkEvents, setBulkEvents] = useState<string[]>([]);
  const [eventOptions, setEventOptions] = useState<EventDTO[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ events: EventDTO[] }>("/api/admin/events")
      .then(({ events }) => !cancelled && setEventOptions(events))
      .catch(() => !cancelled && setEventOptions([]));
    return () => {
      cancelled = true;
    };
  }, []);
  const [skipErrors, setSkipErrors] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startMapping(t: RawTable) {
    if (t.rows.length === 0) {
      setError("No rows found.");
      return;
    }
    setError(null);
    setTable(t);
    setMapping(guessMapping(t));
    setStage("mapping");
  }

  function confirmMapping() {
    if (!table) return;
    validate(buildImportRows(table.rows, mapping));
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "member-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function validate(parsed: ImportRow[]) {
    if (parsed.length === 0) {
      setError("No rows found.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { results } = await api<{ results: RowVerdict[] }>("/api/admin/import/validate", {
        method: "POST",
        body: { rows: parsed },
      });
      setRows(parsed);
      setVerdicts(results);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    // Drop error rows when "skip errors" is on. Banned rows are still sent —
    // the server keeps the ban unless "unban" is checked.
    const toSend = verdicts
      .filter((v) => (skipErrors ? v.errors.length === 0 : true))
      .map((v) => {
        const row = rows[v.rowIndex];
        if (bulkEvents.length === 0) return row;
        const merged = [...new Set([...parseEventIds(row.events), ...bulkEvents])];
        return { ...row, events: merged.join(";") };
      });

    try {
      const all: CommitResult[] = [];
      for (let i = 0; i < toSend.length; i += CHUNK) {
        const chunk = toSend.slice(i, i + CHUNK);
        const { results } = await api<{ results: CommitResult[] }>("/api/admin/import/commit", {
          method: "POST",
          body: { rows: chunk, policy },
        });
        all.push(...results);
      }
      setResults(all);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("input");
    setTable(null);
    setMapping([]);
    setRows([]);
    setVerdicts([]);
    setResults([]);
    setBulkEvents([]);
    setError(null);
  }

  return (
    <div>
      <Link href="/higherground/members" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Members
      </Link>
      <PageHeader
        title="Bulk add members"
        subtitle="Pre-create profiles so people land straight in the app after sign-in."
        action={
          stage === "input" ? (
            <Button variant="ghost" onClick={downloadTemplate}>
              <Download className="size-4" aria-hidden /> Download template
            </Button>
          ) : undefined
        }
      />

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {stage === "input" && (
        <>
          <div className="mb-4 flex gap-1 rounded-full border border-line bg-surface p-1">
            {(["csv", "paste", "single"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  tab === t ? "bg-clay-soft text-clay-deep" : "text-soft hover:text-ink",
                )}
              >
                {t === "csv" ? "Upload CSV" : t === "paste" ? "Paste rows" : "Add one"}
              </button>
            ))}
          </div>

          {tab === "csv" && (
            <CsvTab
              busy={busy}
              onTable={startMapping}
              eventOptions={eventOptions}
              bulkEvents={bulkEvents}
              setBulkEvents={setBulkEvents}
            />
          )}
          {tab === "paste" && <PasteTab busy={busy} onTable={startMapping} />}
          {tab === "single" && <SingleTab />}
        </>
      )}

      {stage === "mapping" && table && (
        <MappingStep
          table={table}
          mapping={mapping}
          setMapping={setMapping}
          busy={busy}
          onBack={() => setStage("input")}
          onContinue={confirmMapping}
        />
      )}

      {stage === "preview" && (
        <PreviewStep
          rows={rows}
          verdicts={verdicts}
          policy={policy}
          setPolicy={setPolicy}
          bulkEvents={bulkEvents}
          setBulkEvents={setBulkEvents}
          eventOptions={eventOptions}
          skipErrors={skipErrors}
          setSkipErrors={setSkipErrors}
          busy={busy}
          onBack={() => (table ? setStage("mapping") : reset())}
          onCommit={commit}
        />
      )}

      {stage === "done" && <ResultStep results={results} rows={rows} onReset={reset} />}
    </div>
  );
}

function CsvTab({
  busy,
  onTable,
  eventOptions,
  bulkEvents,
  setBulkEvents,
}: {
  busy: boolean;
  onTable: (t: RawTable) => void;
  eventOptions: EventDTO[] | null;
  bulkEvents: string[];
  setBulkEvents: (e: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFile(file: File) {
    setFileName(file.name);
    onTable(await parseRawCsvFile(file));
  }

  return (
    <Card>
      <p className="mb-3 text-sm text-soft">
        CSV with a header row — any column names are fine, you&apos;ll match them to fields on the
        next screen. Separate multiple event ids or groups with{" "}
        <code className="rounded bg-line/50 px-1">;</code>.
      </p>
      <div className="mb-4">
        <Field
          label="Give everyone in this file event access (optional)"
          hint="No events column needed — added on top of any events the file already lists. You can still change this on the preview screen."
        >
          <EventChips options={eventOptions} selected={bulkEvents} setSelected={setBulkEvents} />
        </Field>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <Button variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>
        <FileUp className="size-4" aria-hidden /> Choose CSV file
      </Button>
      {fileName && <p className="mt-2 text-[12px] text-faint">{fileName}</p>}
    </Card>
  );
}

function PasteTab({ busy, onTable }: { busy: boolean; onTable: (t: RawTable) => void }) {
  const [text, setText] = useState("");
  return (
    <Card>
      <p className="mb-3 text-sm text-soft">
        Paste rows straight from Excel or Google Sheets (tab-separated) or CSV. A header row is
        optional — you&apos;ll match columns to fields on the next screen either way.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"name\temail\tgroup\nAda Lovelace\tada@example.com\tfounder"}
        className="resize-none font-mono text-[13px]"
      />
      <div className="mt-3">
        <Button loading={busy} onClick={() => onTable(parseRawPasted(text))}>
          Preview rows
        </Button>
      </div>
    </Card>
  );
}

function MappingStep({
  table,
  mapping,
  setMapping,
  busy,
  onBack,
  onContinue,
}: {
  table: RawTable;
  mapping: (keyof ImportRow | "")[];
  setMapping: (m: (keyof ImportRow | "")[]) => void;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const used = new Set(mapping.filter(Boolean));
  const missing = IMPORT_FIELDS.filter((f) => f.required && !used.has(f.key));
  const previewRows = table.rows.slice(0, 3);

  function setColumn(i: number, field: keyof ImportRow | "") {
    const next = [...mapping];
    next[i] = field;
    setMapping(next);
  }

  return (
    <div>
      <Card className="mb-4">
        <p className="mb-3 text-sm text-soft">
          Match each column to a field. Columns left as &quot;Ignore&quot; are dropped.
          {!table.hasHeader && " No header row was detected, so columns are numbered."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} className="min-w-[9rem] px-2 py-2 align-top">
                    <div className="mb-1.5 truncate text-[12px] font-semibold uppercase tracking-wide text-faint" title={h}>
                      {h || `Column ${i + 1}`}
                    </div>
                    <Select value={mapping[i] ?? ""} onChange={(e) => setColumn(i, e.target.value as keyof ImportRow | "")}>
                      <option value="">Ignore column</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </option>
                      ))}
                    </Select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri} className="border-t border-line">
                  {table.headers.map((_, ci) => (
                    <td key={ci} className="truncate px-2 py-2 text-soft">
                      {row[ci] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-faint">{table.rows.length} row(s) total.</p>
        {missing.length > 0 && (
          <p className="mt-2 text-sm text-danger">Map a column to: {missing.map((f) => f.label).join(", ")}</p>
        )}
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button loading={busy} disabled={missing.length > 0} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function SingleTab() {
  const [row, setRow] = useState<ImportRow>({ name: "", email: "" });
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function set<K extends keyof ImportRow>(k: K, v: ImportRow[K]) {
    setRow((r) => ({ ...r, [k]: v }));
  }

  function toggleGroup(g: MemberGroup) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { result } = await api<{ result: CommitResult }>("/api/admin/members", {
        method: "POST",
        body: { ...row, group: groups.join(";") },
      });
      setMsg({ tone: "ok", text: `${result.action}: ${result.email}` });
      setRow({ name: "", email: "" });
      setGroups([]);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={row.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={row.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
        </div>
        <Field label="Groups (optional)">
          <div className="flex flex-wrap gap-1.5">
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
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <Input value={row.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Company">
            <Input value={row.company ?? ""} onChange={(e) => set("company", e.target.value)} />
          </Field>
        </div>
        <Field label="Events" hint="Semicolon-separated event ids, e.g. summit;community">
          <Input value={row.events ?? ""} onChange={(e) => set("events", e.target.value)} placeholder="summit" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={row.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="LinkedIn">
            <Input value={row.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} />
          </Field>
        </div>
        {msg && <p className={cn("text-sm", msg.tone === "ok" ? "text-sage" : "text-danger")}>{msg.text}</p>}
        <Button type="submit" loading={busy}>
          Add member
        </Button>
      </form>
    </Card>
  );
}

const KIND_LABEL: Record<RowVerdict["kind"], { label: string; tone: "sage" | "sky" | "amber" | "danger" }> = {
  new: { label: "New", tone: "sage" },
  "exists-no-profile": { label: "Auth only", tone: "sky" },
  "exists-with-profile": { label: "Existing", tone: "amber" },
  error: { label: "Error", tone: "danger" },
};

function EventChips({
  options,
  selected,
  setSelected,
}: {
  options: EventDTO[] | null;
  selected: string[];
  setSelected: (e: string[]) => void;
}) {
  if (options === null) return <p className="text-[12px] text-faint">Loading events…</p>;
  if (options.length === 0) return <p className="text-[12px] text-faint">No events yet.</p>;

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((ev) => {
        const on = selected.includes(ev.id);
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => toggle(ev.id)}
            aria-pressed={on}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
              on
                ? "bg-clay-soft text-clay-deep"
                : "border border-dashed border-line text-faint hover:border-faint hover:text-soft",
            )}
          >
            {on ? "✓ " : "+ "}
            {ev.shortName || ev.name || ev.id}
          </button>
        );
      })}
    </div>
  );
}

function PreviewStep({
  rows,
  verdicts,
  policy,
  setPolicy,
  bulkEvents,
  setBulkEvents,
  eventOptions,
  skipErrors,
  setSkipErrors,
  busy,
  onBack,
  onCommit,
}: {
  rows: ImportRow[];
  verdicts: RowVerdict[];
  policy: ImportPolicy;
  setPolicy: (p: ImportPolicy) => void;
  bulkEvents: string[];
  setBulkEvents: (e: string[]) => void;
  eventOptions: EventDTO[] | null;
  skipErrors: boolean;
  setSkipErrors: (b: boolean) => void;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const counts = {
    new: verdicts.filter((v) => v.kind === "new").length,
    existing: verdicts.filter((v) => v.kind === "exists-with-profile").length,
    authOnly: verdicts.filter((v) => v.kind === "exists-no-profile").length,
    error: verdicts.filter((v) => v.errors.length > 0).length,
    banned: verdicts.filter((v) => v.banned).length,
  };
  const hasErrors = counts.error > 0;
  const canCommit = !hasErrors || skipErrors;

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="sage">{counts.new} new</Badge>
          <Badge tone="amber">{counts.existing} existing</Badge>
          {counts.authOnly > 0 && <Badge tone="sky">{counts.authOnly} auth-only</Badge>}
          {counts.error > 0 && <Badge tone="danger">{counts.error} errors</Badge>}
          {counts.banned > 0 && <Badge tone="danger">{counts.banned} banned</Badge>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Existing profiles">
            <Select
              value={policy.existing}
              onChange={(e) => setPolicy({ ...policy, existing: e.target.value as "skip" | "update" })}
            >
              <option value="update">Update profile &amp; add event access</option>
              <option value="skip">Skip (leave unchanged)</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-soft">
            <input
              type="checkbox"
              checked={policy.unbanOnImport}
              onChange={(e) => setPolicy({ ...policy, unbanOnImport: e.target.checked })}
            />
            Unban imported users
          </label>
        </div>

        <div className="mt-4">
          <Field
            label="Add event access to all rows"
            hint="Applied on top of each row's own events — existing access is never removed."
          >
            <EventChips options={eventOptions} selected={bulkEvents} setSelected={setBulkEvents} />
          </Field>
        </div>

        {hasErrors && (
          <label className="mt-1 flex items-center gap-2 text-sm text-soft">
            <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} />
            Skip {counts.error} error row(s) and import the rest
          </label>
        )}
      </Card>

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-line/30 text-[12px] uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Events</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {verdicts.map((v) => {
              const kind = KIND_LABEL[v.errors.length ? "error" : v.kind];
              return (
                <tr key={v.rowIndex} className={cn("border-t border-line", v.errors.length && "bg-danger-soft/40")}>
                  <td className="px-3 py-2 text-faint">{v.rowIndex + 1}</td>
                  <td className="px-3 py-2">
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    {v.banned && <span className="ml-1"><Badge tone="danger">Banned</Badge></span>}
                  </td>
                  <td className="px-3 py-2">{v.name || rows[v.rowIndex]?.name || "—"}</td>
                  <td className="px-3 py-2">{v.email || "—"}</td>
                  <td className="px-3 py-2 text-soft">
                    {[...new Set([...v.events, ...bulkEvents])].join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-[13px] text-danger">{v.errors.join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button loading={busy} disabled={!canCommit} onClick={onCommit}>
          Import {skipErrors ? counts.new + counts.existing + counts.authOnly : verdicts.length} member(s)
        </Button>
      </div>
    </div>
  );
}

function ResultStep({
  results,
  rows,
  onReset,
}: {
  results: CommitResult[];
  rows: ImportRow[];
  onReset: () => void;
}) {
  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.action === "skipped").length;
  const failed = results.filter((r) => r.action === "error");

  function downloadFailures() {
    const failedRows = failed.map((f) => rows[f.rowIndex]).filter(Boolean);
    const blob = new Blob([rowsToCsv(failedRows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-failures.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sage">{created} created</Badge>
          <Badge tone="amber">{updated} updated</Badge>
          {skipped > 0 && <Badge tone="neutral">{skipped} skipped</Badge>}
          {failed.length > 0 && <Badge tone="danger">{failed.length} failed</Badge>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={onReset}>Import more</Button>
          {failed.length > 0 && (
            <Button variant="ghost" onClick={downloadFailures}>
              <Download className="size-4" aria-hidden /> Download failures
            </Button>
          )}
        </div>
      </Card>

      {failed.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-line/30 text-[12px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((f) => (
                <tr key={f.rowIndex} className="border-t border-line">
                  <td className="px-3 py-2">{f.email}</td>
                  <td className="px-3 py-2 text-danger">{f.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
