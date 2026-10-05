"use client";

import { forwardRef, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn, coverGradient, initials } from "@/lib/utils";
import type { MemberGroup } from "@/lib/types";
import { GROUP_LABELS } from "@/lib/types";

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-clay text-white hover:bg-clay-deep active:bg-clay-deep disabled:bg-clay/40",
  secondary:
    "bg-clay-soft text-clay-deep hover:bg-clay-soft/70 disabled:opacity-50",
  ghost:
    "bg-transparent text-soft hover:bg-line/50 disabled:opacity-50",
  danger:
    "bg-danger-soft text-danger hover:bg-danger-soft/70 disabled:opacity-50",
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors",
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

/* ---------------------------------- Inputs --------------------------------- */

const fieldStyles =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-faint focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(fieldStyles, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldStyles, "resize-none", className)} {...rest} />;
});

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-soft">{label}</span>
      {children}
    </label>
  );
}

/* ---------------------------------- Avatar --------------------------------- */

const avatarPalettes = [
  "bg-clay-soft text-clay-deep",
  "bg-sage-soft text-sage",
  "bg-amber-soft text-amber",
  "bg-sky-soft text-sky",
  "bg-plum-soft text-plum",
];

export function Avatar({
  name,
  uid,
  size = "md",
  src,
  className,
}: {
  name: string;
  uid: string;
  size?: "sm" | "md" | "lg";
  /** Uploaded profile photo; when absent, falls back to the initials avatar. */
  src?: string;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  const palette = avatarPalettes[Math.abs(hash) % avatarPalettes.length];
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        size === "sm" && "size-9 text-[13px]",
        size === "md" && "size-11 text-[15px]",
        size === "lg" && "size-16 text-xl",
        palette,
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary Storage host
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name) || "?"
      )}
    </div>
  );
}

/* ----------------------------------- Chips --------------------------------- */

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

export function GroupChip({ groups, className }: { groups?: MemberGroup[]; className?: string }) {
  const valid = (groups ?? []).filter((g) => GROUP_LABELS[g]);
  if (!valid.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
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

/* --------------------------------- Covers ---------------------------------- */

/**
 * Deterministic warm gradient banner with soft decorative circles — the same
 * visual treatment as room covers, reusable behind profiles and headers.
 */
export function CoverBanner({
  seed,
  imageUrl,
  className,
  children,
}: {
  seed: string;
  /** Uploaded cover image; when absent, falls back to the generated gradient. */
  imageUrl?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { from, to } = coverGradient(seed);
  return (
    <div
      aria-hidden={!children}
      className={cn("relative isolate overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {imageUrl ? (
        // Sits above the gradient but below any overlaid children (icon/label),
        // which paint over it as in-flow content. eslint-disable: user-uploaded,
        // arbitrary Storage host, so next/image's remotePatterns don't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" loading="lazy" />
      ) : (
        <>
          <div className="absolute -left-6 -top-10 size-28 rounded-full bg-white/10" />
          <div className="absolute -bottom-12 -right-6 size-32 rounded-full bg-black/10" />
        </>
      )}
      {children}
    </div>
  );
}

/**
 * A styled trigger that opens the OS image picker and hands the chosen File to
 * `onPick`. Presentational only — the caller owns upload + persistence and
 * reflects progress via `busy`. The input is reset after each pick so choosing
 * the same file twice still fires.
 */
export function ImagePickerButton({
  onPick,
  busy = false,
  label,
  className,
  children,
}: {
  onPick: (file: File) => void;
  busy?: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn("disabled:opacity-70", className)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}

/* -------------------------------- View toggle ------------------------------- */

export interface ViewOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

/** Pill icon-toggle between page layouts (list / board), as used on Rooms. */
export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ViewOption<T>[];
}) {
  return (
    <div className="flex rounded-full border border-line bg-surface p-1" role="group" aria-label="View">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-label={option.label}
          aria-pressed={value === option.value}
          className={cn(
            "flex size-9 items-center justify-center rounded-full transition-colors",
            value === option.value ? "bg-ink text-white" : "text-faint hover:text-soft",
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- Page furniture ----------------------------- */

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
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
      {icon && (
        <div
          aria-hidden
          className="relative mb-2 flex size-20 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-clay-soft to-amber-soft text-clay"
        >
          <div className="absolute -left-4 -top-6 size-14 rounded-full bg-white/50" />
          <div className="absolute -bottom-7 -right-4 size-16 rounded-full bg-clay/10" />
          <div className="relative">{icon}</div>
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="text-sm text-soft">{body}</p>}
      {children && <div className="mt-3">{children}</div>}
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
