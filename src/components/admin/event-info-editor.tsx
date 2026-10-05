"use client";

import { useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { Textarea } from "@/components/admin/ui";
import { RichContent } from "@/components/rich-content";
import { cn } from "@/lib/utils";

/**
 * Quick-insert scaffolds — the "structured sections" authoring style. Each drops
 * a Markdown block at the cursor, so admins get structured building blocks
 * without a separate data model. Markdown also passes raw HTML straight through,
 * so pasting HTML into the textarea works too.
 */
const SNIPPETS: { label: string; insert: string }[] = [
  { label: "Heading", insert: "\n## Section title\n\n" },
  { label: "Sub-heading", insert: "\n### Subsection\n\n" },
  { label: "List", insert: "\n- First item\n- Second item\n- Third item\n" },
  { label: "Link", insert: "[link text](https://example.com)" },
  { label: "Map link", insert: "[Open in Google Maps](https://maps.app.goo.gl/xxxx)" },
  { label: "Table", insert: "\n| Column A | Column B |\n| --- | --- |\n| Value | Value |\n| Value | Value |\n" },
  {
    label: "Emergency contacts",
    insert:
      "\n## Emergency Contacts (Singapore)\n\n" +
      "| Type | Number |\n| --- | --- |\n" +
      "| Police | 999 |\n| Fire & Ambulance (SCDF) | 995 |\n" +
      "| Non-Emergency Ambulance | 1777 |\n| Police SMS | 71999 |\n" +
      "| Traffic Police | 6547 0000 |\n",
  },
  { label: "Divider", insert: "\n\n---\n\n" },
];

/**
 * Authoring surface for an event's info/logistics page. Write Markdown (or paste
 * HTML), use the chips to insert structured blocks, and flip to Preview to see
 * exactly what members will get on /info.
 */
export function EventInfoEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function insert(snippet: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    // Re-focus and drop the caret after the inserted text once React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="block text-sm font-semibold">Event info page</span>
          <span className="block text-[13px] text-soft">
            Hotel, getting there, attractions, contacts… Members open it from the top bar.
          </span>
        </div>
        <div className="flex shrink-0 rounded-full border border-line bg-surface p-0.5">
          <TabButton active={!preview} onClick={() => setPreview(false)} icon={Pencil} label="Write" />
          <TabButton active={preview} onClick={() => setPreview(true)} icon={Eye} label="Preview" />
        </div>
      </div>

      {preview ? (
        <div className="min-h-[12rem] rounded-xl border border-line bg-paper p-4">
          {value.trim() ? (
            <RichContent content={value} />
          ) : (
            <p className="text-sm text-faint">Nothing to preview yet — write something on the left.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {SNIPPETS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => insert(s.insert)}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-soft hover:border-faint hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </div>
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            spellCheck
            placeholder={
              "## Main Hall\n\n**Address:** 1 Example Street\n**Phone:** +1 555 0100\n\n[Website](https://example.com) · [Map](https://maps.example.com)\n\n## Getting There\n\n- Enter from the main lobby…"
            }
            className="min-h-[16rem] font-mono text-[13px] leading-relaxed"
          />
          <p className="text-[12px] text-faint">
            Formatting uses Markdown — <code className="rounded bg-line px-1">## Heading</code>,{" "}
            <code className="rounded bg-line px-1">- list</code>,{" "}
            <code className="rounded bg-line px-1">[text](url)</code>. Raw HTML works too.
          </p>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Pencil;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold transition-colors",
        active ? "bg-ink text-white" : "text-faint hover:text-soft",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
