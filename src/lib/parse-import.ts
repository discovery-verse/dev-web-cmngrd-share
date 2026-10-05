import Papa from "papaparse";
import type { ImportRow } from "@/lib/api-types";

/** Every field a row can carry, in the order used for headerless paste + the template. */
export const IMPORT_FIELDS: { key: keyof ImportRow; label: string; required?: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "group", label: "Group" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "events", label: "Events" },
  { key: "phone", label: "Phone" },
  { key: "linkedin", label: "LinkedIn" },
];

const CANONICAL_ORDER = IMPORT_FIELDS.map((f) => f.key);

/** Header aliases → canonical ImportRow field, used to pre-guess a column's mapping. */
const HEADER_MAP: Record<string, keyof ImportRow> = {
  name: "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  group: "group",
  type: "group",
  title: "title",
  role: "title",
  "job title": "title",
  company: "company",
  organisation: "company",
  organization: "company",
  events: "events",
  event: "events",
  phone: "phone",
  mobile: "phone",
  linkedin: "linkedin",
  "linkedin url": "linkedin",
};

function guessField(header: string): keyof ImportRow | "" {
  return HEADER_MAP[header.trim().toLowerCase()] ?? "";
}

export interface RawTable {
  headers: string[];
  rows: string[][];
  /** Whether `headers` came from an actual header row, vs synthetic "Column N" labels. */
  hasHeader: boolean;
}

/** Parse a CSV file into a raw header + row grid, for the column-mapping step. */
export function parseRawCsvFile(file: File): Promise<RawTable> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as string[][];
        if (data.length === 0) return resolve({ headers: [], rows: [], hasHeader: true });
        const [headerRow, ...rest] = data;
        resolve({ headers: headerRow.map((h) => h.trim()), rows: rest, hasHeader: true });
      },
      error: reject,
    });
  });
}

/**
 * Parse pasted spreadsheet text into a raw header + row grid. Auto-detects tab
 * vs comma. If the first line looks like a header (contains no "@"), it's used
 * as the header row; otherwise synthetic "Column N" headers are generated and
 * every line is treated as data.
 */
export function parseRawPasted(text: string): RawTable {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [], rows: [], hasHeader: false };
  const firstLine = trimmed.split(/\r?\n/)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const hasHeader = !firstLine.includes("@");

  const res = Papa.parse<string[]>(trimmed, { delimiter, skipEmptyLines: true });
  const data = res.data as string[][];
  if (data.length === 0) return { headers: [], rows: [], hasHeader };

  if (hasHeader) {
    const [headerRow, ...rest] = data;
    return { headers: headerRow.map((h) => h.trim()), rows: rest, hasHeader: true };
  }
  const width = Math.max(...data.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { headers, rows: data, hasHeader: false };
}

/** Best-guess column → field mapping: by header text, or canonical order if headerless. */
export function guessMapping(table: RawTable): (keyof ImportRow | "")[] {
  if (table.hasHeader) return table.headers.map(guessField);
  return table.headers.map((_, i) => CANONICAL_ORDER[i] ?? "");
}

/** Apply a confirmed column → field mapping to raw rows, producing normalized ImportRows. */
export function buildImportRows(rows: string[][], mapping: (keyof ImportRow | "")[]): ImportRow[] {
  return rows
    .map((cols) => {
      const out: ImportRow = { name: "", email: "", group: "" };
      mapping.forEach((field, i) => {
        if (field) out[field] = (cols[i] ?? "").trim();
      });
      return out;
    })
    .filter((r) => r.name || r.email);
}

/** Build a CSV string of rows for re-download (e.g. failed rows). */
export function rowsToCsv(rows: ImportRow[]): string {
  return Papa.unparse(rows.map((r) => Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, r[f.key] ?? ""]))));
}

/** Blank import template: header row + one filled-in example row. */
export function templateCsv(): string {
  return Papa.unparse([
    {
      name: "Ada Lovelace",
      email: "ada@example.com",
      group: "founder",
      title: "Founder & CEO",
      company: "Example Co",
      events: "summit;community",
      phone: "+65 9123 4567",
      linkedin: "https://linkedin.com/in/ada",
    },
  ]);
}
