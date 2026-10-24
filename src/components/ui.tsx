import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cx = clsx;

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function Mark({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill={inverted ? "#C6F36B" : "#080808"} />
      <path d="M8.5 9.5 L16 23 L23.5 9.5" fill="none" stroke={inverted ? "#080808" : "#C6F36B"} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ dark = false, size = 28, href = "/" }: { dark?: boolean; size?: number; href?: string | null }) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} inverted={dark} />
      <span className={cx("font-semibold tracking-tight", dark ? "text-paper" : "text-ink")} style={{ fontSize: size * 0.68 }}>
        V<span className={dark ? "text-lime" : "text-g400"}>.</span>app
      </span>
    </span>
  );
  return href ? <Link href={href} aria-label="V.app home" className="rounded-md">{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "dark" | "outline" | "ghost" | "danger" | "outline-dark";
const btn = (v: Variant, size: "sm" | "md" | "lg") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 select-none whitespace-nowrap",
    "disabled:opacity-45 disabled:cursor-not-allowed",
    size === "sm" && "h-9 px-4 text-sm",
    size === "md" && "h-11 px-5 text-[0.95rem]",
    size === "lg" && "h-13 px-7 text-base",
    v === "primary" && "bg-lime text-ink hover:bg-lime-deep",
    v === "dark" && "bg-ink text-paper hover:bg-g800",
    v === "outline" && "border border-g300 bg-paper text-ink hover:border-ink",
    v === "outline-dark" && "border border-g600 text-paper hover:border-lime",
    v === "ghost" && "text-ink hover:bg-g100",
    v === "danger" && "bg-danger text-paper hover:bg-[#912018]",
  );

export function Button({ variant = "dark", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return <button {...p} className={cx(btn(variant, size), className)} />;
}
export function ButtonLink({ variant = "dark", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return <Link {...p} className={cx(btn(variant, size), className)} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
const fieldBase = "w-full rounded-xl border border-g300 bg-paper px-3.5 text-ink placeholder:text-g400 transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70 disabled:bg-g50 disabled:text-g500 aria-[invalid=true]:border-danger";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cx(fieldBase, "h-11", className)} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(fieldBase, "min-h-24 py-2.5", className)} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select {...p} className={cx(fieldBase, "h-11 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22><path d=%22M3 4.5 6 7.5 9 4.5%22 fill=%22none%22 stroke=%22%23080808%22 stroke-width=%221.5%22/></svg>')] bg-[right_0.9rem_center] bg-no-repeat", className)} />;
}
export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-g500">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[0.8rem] text-g500" id={`${htmlFor}-hint`}>{hint}</p>}
      {error && <p className="text-[0.8rem] text-danger" role="alert">{error}</p>}
    </div>
  );
}
export function Check({ name, label, description, defaultChecked, disabled, value = "on" }: { name: string; label: string; description?: string; defaultChecked?: boolean; disabled?: boolean; value?: string }) {
  const id = `chk-${name}-${value}`;
  return (
    <label htmlFor={id} className={cx("flex gap-3 rounded-xl border border-g200 p-3.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-g50", disabled ? "opacity-60" : "cursor-pointer hover:border-g400")}>
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} className="mt-0.5 size-4.5 accent-ink" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-[0.82rem] text-g500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function Card({ className, children, dark, ...p }: ComponentProps<"section"> & { dark?: boolean }) {
  return <section {...p} className={cx("rounded-[var(--radius-card)] border p-5 sm:p-6", dark ? "border-g700 bg-g900 text-paper" : "border-g200 bg-paper", className)}>{children}</section>;
}
export function PageHeader({ eyebrow, title, description, actions, dark }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; dark?: boolean }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className={cx("eyebrow mb-2", dark ? "text-g400" : "text-g500")}>{eyebrow}</p>}
        <h1 className="text-[1.75rem] sm:text-[2.1rem] font-semibold leading-tight break-words">{title}</h1>
        {description && <p className={cx("mt-2 max-w-2xl", dark ? "text-g300" : "text-g600")}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
export function Stat({ label, value, sub, dark, accent }: { label: string; value: ReactNode; sub?: ReactNode; dark?: boolean; accent?: boolean }) {
  return (
    <div className={cx("rounded-[var(--radius-card)] border p-4 sm:p-5", accent ? "border-lime bg-lime text-ink" : dark ? "border-g700 bg-g900" : "border-g200 bg-paper")}>
      <p className={cx("text-[0.8rem]", accent ? "text-ink/70" : dark ? "text-g400" : "text-g500")}>{label}</p>
      <p className="mt-1.5 text-[1.9rem] font-semibold tabular leading-none tracking-tight">{value}</p>
      {sub && <p className={cx("mt-2 text-[0.8rem]", accent ? "text-ink/70" : dark ? "text-g400" : "text-g500")}>{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "border-g300 text-g600",
  scheduled: "border-ink text-ink",
  open: "border-lime bg-lime text-ink",
  paused: "border-warn bg-warn-soft text-warn",
  closed: "border-g400 text-g600",
  results_pending: "border-ink bg-ink text-paper",
  published: "border-ink bg-ink text-lime",
  retention: "border-g400 bg-g100 text-g600",
  deleted: "border-g300 bg-g100 text-g500 line-through",
  active: "border-lime bg-lime text-ink",
  invited: "border-g300 text-g600",
  suspended: "border-warn bg-warn-soft text-warn",
  revoked: "border-danger bg-danger-soft text-danger",
  succeeded: "border-lime bg-lime text-ink",
  completed: "border-lime bg-lime text-ink",
  failed: "border-danger bg-danger-soft text-danger",
  running: "border-ink text-ink",
  notified: "border-ink text-ink",
  critical: "border-danger bg-danger-soft text-danger",
  warning: "border-warn bg-warn-soft text-warn",
  info: "border-g300 text-g600",
  withdrawn: "border-g300 bg-g100 text-g500",
  disqualified: "border-danger bg-danger-soft text-danger",
  pending: "border-g300 text-g600",
  sent: "border-g300 text-g600",
};
export function Badge({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium whitespace-nowrap", STATUS_STYLE[tone] ?? STATUS_STYLE.info, className)}>
      {tone === "open" && <span className="size-1.5 rounded-full bg-ink animate-pulse" aria-hidden />}
      {children}
    </span>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "error"; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm",
      tone === "info" && "border-g200 bg-g50 text-g700",
      tone === "success" && "border-ink bg-lime/40 text-ink",
      tone === "warning" && "border-[#f0d58a] bg-warn-soft text-warn",
      tone === "error" && "border-[#fecdca] bg-danger-soft text-danger", className)}>
      {title && <p className="font-medium mb-0.5">{title}</p>}
      {children}
    </div>
  );
}

export function Empty({ title, children, action, dark }: { title: string; children?: ReactNode; action?: ReactNode; dark?: boolean }) {
  return (
    <div className={cx("rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center", dark ? "border-g700" : "border-g300")}>
      <div className="mx-auto mb-4 grid size-10 place-items-center rounded-full border border-current opacity-40" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 4.5 8 12l5-7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <p className="font-medium">{title}</p>
      {children && <div className={cx("mt-1.5 text-sm max-w-md mx-auto", dark ? "text-g400" : "text-g500")}>{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Responsive table: scrolls horizontally on small screens with a visible affordance. */
export function Table({ children, caption, dark }: { children: ReactNode; caption?: string; dark?: boolean }) {
  return (
    <div className={cx("overflow-x-auto rounded-[var(--radius-card)] border", dark ? "border-g700" : "border-g200")} tabIndex={0} role="region" aria-label={caption ?? "Table"}>
      <table className={cx("w-full min-w-[560px] text-left text-sm [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_td]:px-4 [&_td]:py-3 [&_td]:align-top",
        dark ? "[&_thead]:bg-g900 [&_th]:text-g400 [&_tbody_tr]:border-t [&_tbody_tr]:border-g800" : "[&_thead]:bg-g50 [&_th]:text-g500 [&_tbody_tr]:border-t [&_tbody_tr]:border-g100")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Progress({ value, label, dark }: { value: number; label: string; dark?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}
      className={cx("h-2 w-full overflow-hidden rounded-full", dark ? "bg-g800" : "bg-g100")}>
      <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Accessible horizontal bar chart; the same data is available as text for screen readers. */
export function Bars({ items, label, dark, hideValues }: { items: { label: string; value: number; pct: number; highlight?: boolean; note?: string }[]; label: string; dark?: boolean; hideValues?: boolean }) {
  return (
    <figure aria-label={label} className="space-y-3">
      {items.map((it) => (
        <div key={it.label} className="print-break">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cx("font-medium truncate", it.highlight && "flex items-center gap-2")}>
              {it.label}{it.note && <span className={cx("text-[0.72rem] font-medium rounded-full px-2 py-0.5", it.note === "Tie" ? "bg-warn-soft text-warn" : dark ? "bg-lime text-ink" : "bg-ink text-lime")}>{it.note}</span>}
            </span>
            <span className={cx("tabular shrink-0", dark ? "text-g300" : "text-g600")}>{hideValues ? "" : `${it.value.toLocaleString("en-IN")} · `}{it.pct.toFixed(1)}%</span>
          </div>
          <div className={cx("mt-1.5 h-2.5 rounded-full", dark ? "bg-g800" : "bg-g100")} aria-hidden>
            <div className={cx("h-full rounded-full", it.highlight ? "bg-lime" : dark ? "bg-g500" : "bg-g400")} style={{ width: `${Math.max(it.pct, it.pct > 0 ? 1 : 0)}%` }} />
          </div>
        </div>
      ))}
    </figure>
  );
}

export function fmtDate(d: Date | string | null | undefined, tz = "Asia/Kolkata", style: "full" | "short" = "short") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: style === "full" ? "full" : "medium", timeStyle: "short", timeZone: tz }).format(new Date(d));
}
export function relTime(d: Date | string | null | undefined) {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const abs = Math.abs(s), fut = s < 0;
  const f = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  const t = abs < 60 ? "moments" : abs < 3600 ? f(Math.round(abs / 60), "minute") : abs < 86400 ? f(Math.round(abs / 3600), "hour") : f(Math.round(abs / 86400), "day");
  return abs < 60 ? (fut ? "in moments" : "just now") : fut ? `in ${t}` : `${t} ago`;
}
