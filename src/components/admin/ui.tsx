"use client";

/**
 * Admin-console UI primitives. Kept separate from the app's mobile-first
 * @/components/ui so the desktop console can size/space independently. Only
 * shared low-level helpers (cn, GROUP_LABELS) are reused.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Loader2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { GROUP_LABELS, type MemberGroup } from "@/lib/types";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-clay text-white hover:bg-clay-deep disabled:bg-clay/40",
  secondary: "bg-clay-soft text-clay-deep hover:bg-clay-soft/70 disabled:opacity-50",
  ghost: "bg-transparent text-soft hover:bg-line/50 disabled:opacity-50",
  danger: "bg-danger-soft text-danger hover:bg-danger-soft/70 disabled:opacity-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

const fieldStyles =
  "w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(fieldStyles, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(fieldStyles, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(fieldStyles, "cursor-pointer", className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-soft">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

/**
 * Like Field, but rendered as a plain group instead of a <label> — for sections
 * whose children include buttons or lists, where a wrapping label would forward
 * clicks to the first form control.
 */
export function FieldGroup({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[13px] font-semibold text-soft">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-faint">{hint}</span>}
    </div>
  );
}

const avatarPalettes = [
  "bg-clay-soft text-clay-deep",
  "bg-sage-soft text-sage",
  "bg-amber-soft text-amber",
  "bg-sky-soft text-sky",
  "bg-plum-soft text-plum",
];

export function Avatar({ name, uid }: { name: string; uid: string }) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  const palette = avatarPalettes[Math.abs(hash) % avatarPalettes.length];
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
        palette,
      )}
    >
      {initials(name) || "?"}
    </div>
  );
}

const groupChipStyles: Record<MemberGroup, string> = {
  founder: "bg-amber-soft text-amber",
  executive: "bg-plum-soft text-plum",
  nonprofit: "bg-sage-soft text-sage",
  church: "bg-clay-soft text-clay-deep",
  investor: "bg-ink/10 text-ink",
  corporate: "bg-sky-soft text-sky",
  speaker: "bg-teal-soft text-teal",
  panelist: "bg-rose-soft text-rose",
  "startup-pitch": "bg-violet-soft text-violet",
  team: "bg-slate-soft text-slate",
};

export function GroupChip({ groups }: { groups?: MemberGroup[] }) {
  const valid = (groups ?? []).filter((g) => GROUP_LABELS[g]);
  if (!valid.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {valid.map((g) => (
        <span
          key={g}
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
            groupChipStyles[g],
          )}
        >
          {GROUP_LABELS[g]}
        </span>
      ))}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "sage" | "amber" | "sky";
}) {
  const tones = {
    neutral: "bg-line/60 text-soft",
    danger: "bg-danger-soft text-danger",
    sage: "bg-sage-soft text-sage",
    amber: "bg-amber-soft text-amber",
    sky: "bg-sky-soft text-sky",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-card bg-surface p-5 shadow-card", className)}>{children}</div>;
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-line px-8 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="text-sm text-soft">{body}</p>}
    </div>
  );
}

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-soft">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-6 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
