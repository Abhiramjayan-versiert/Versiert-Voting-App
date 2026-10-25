"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cx, Notice } from "./ui";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: unknown } | null;
export type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Pending state for forms submitted without React's auto-reset (see ActionForm). */
const PendingCtx = createContext(false);

export function SubmitButton({ children, variant = "dark", size = "md", className, pendingText, disabled, name, value }: {
  children: ReactNode; variant?: "primary" | "dark" | "outline" | "danger" | "ghost" | "outline-dark"; size?: "sm" | "md" | "lg";
  className?: string; pendingText?: string; disabled?: boolean; name?: string; value?: string;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingCtx);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending}
      className={cx("inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-9 px-4 text-sm" : size === "lg" ? "h-13 px-7" : "h-11 px-5 text-[0.95rem]",
        variant === "primary" && "bg-lime text-ink hover:bg-lime-deep",
        variant === "dark" && "bg-ink text-paper hover:bg-g800",
        variant === "outline" && "border border-g300 bg-paper hover:border-ink",
        variant === "outline-dark" && "border border-g600 text-paper hover:border-lime",
        variant === "ghost" && "hover:bg-g100",
        variant === "danger" && "bg-danger text-paper hover:bg-[#912018]", className)}>
      {pending && <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}

/** Wraps a Server Action form, showing success/error state accessibly. */
export function ActionForm({ action, children, className, resetOnSuccess, onSuccess }: {
  action: Action; children: ReactNode | ((s: ActionState) => ReactNode); className?: string; resetOnSuccess?: boolean; onSuccess?: (s: ActionState) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) { if (resetOnSuccess) ref.current?.reset(); onSuccess?.(state); }
  }, [state, resetOnSuccess, onSuccess]);
  // Submit manually so React doesn't auto-reset the form: typed values (and chosen files)
  // survive a validation error. Successful forms reset only when resetOnSuccess is set.
  return (
    <form ref={ref} className={className} aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, sub ?? undefined);
        startTransition(() => formAction(fd));
      }}>
      <PendingCtx.Provider value={pending}>{typeof children === "function" ? children(state) : children}</PendingCtx.Provider>
      {state?.error && <Notice tone="error" className="mt-4">{state.error}</Notice>}
      {state?.ok && state.message && <Notice tone="success" className="mt-4">{state.message}</Notice>}
      {state?.ok && (state.data as { link?: string } | undefined)?.link && <LinkReveal link={(state.data as { link: string }).link} />}
    </form>
  );
}

/** Two-step confirmation for destructive or irreversible actions, using the native <dialog> element. */
export function Confirm({ trigger, title, body, action, confirmLabel = "Confirm", tone = "dark", hidden, requireText, reasonLabel, triggerClass }: {
  trigger: ReactNode; title: string; body: ReactNode; action: Action; confirmLabel?: string; tone?: "dark" | "danger" | "primary";
  hidden?: Record<string, string>; requireText?: string; reasonLabel?: string; triggerClass?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(action, null);
  const revealed = state?.ok ? (state.data as { link?: string } | undefined)?.link : undefined;
  // Keep the dialog open when the action returns a link to hand over (e.g. a single-use voting or reset link).
  useEffect(() => { if (state?.ok && !revealed) ref.current?.close(); }, [state, revealed]);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => { setTyped(""); ref.current?.showModal(); }}>{trigger}</button>
      <dialog ref={ref} className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-g200 bg-paper p-0 text-ink backdrop:bg-ink/60 backdrop:backdrop-blur-[2px]" aria-labelledby={`dlg-${title}`}>
        <form className="p-6" onSubmit={(e) => { e.preventDefault(); if (pending) return; const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }}>
          <h2 id={`dlg-${title}`} className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-g600 space-y-2">{body}</div>
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {reasonLabel && (
            <div className="mt-4 space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`reason-${title}`}>{reasonLabel}</label>
              <textarea id={`reason-${title}`} name="reason" required minLength={10} maxLength={1000} className="w-full rounded-xl border border-g300 px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" rows={3} />
            </div>
          )}
          {requireText && (
            <div className="mt-4 space-y-1.5">
              <label className="text-sm" htmlFor={`type-${title}`}>Type <strong className="font-mono">{requireText}</strong> to confirm</label>
              <input id={`type-${title}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-11 w-full rounded-xl border border-g300 px-3 font-mono focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
              <input type="hidden" name="confirm_text" value={typed} />
            </div>
          )}
          {state?.error && <Notice tone="error" className="mt-4">{state.error}</Notice>}
          {revealed && <>{state?.message && <Notice tone="success" className="mt-4">{state.message}</Notice>}<LinkReveal link={revealed} /></>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => ref.current?.close()} className="h-11 rounded-full border border-g300 px-5 text-sm font-medium hover:border-ink">{revealed ? "Done" : "Cancel"}</button>
            <PendingCtx.Provider value={pending}><SubmitButton variant={tone} disabled={!!requireText && typed !== requireText}>{confirmLabel}</SubmitButton></PendingCtx.Provider>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function CopyButton({ text, label = "Copy link", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={cx("inline-flex h-9 items-center gap-2 rounded-full border border-g300 px-4 text-sm font-medium hover:border-ink", className)}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* clipboard blocked */ } }}>
      <span aria-live="polite">{done ? "Copied ✓" : label}</span>
    </button>
  );
}

export function PrintButton({ className }: { className?: string }) {
  return <button type="button" onClick={() => window.print()} className={cx("no-print inline-flex h-9 items-center rounded-full border border-g300 px-4 text-sm font-medium hover:border-ink", className)}>Print</button>;
}

function LinkReveal({ link }: { link: string }) {
  return (
    <div className="mt-3 rounded-xl border border-g300 bg-g50 p-3 text-ink">
      <p className="text-xs text-g600">Single-use link. Share it only with the account holder over a trusted channel:</p>
      <p className="mt-1 break-all font-mono text-[0.78rem]">{link}</p>
      <CopyButton text={link} className="mt-2" />
    </div>
  );
}
