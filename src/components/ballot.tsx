"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./candidate-avatar";
import { cx } from "./ui";

export type BallotPosition = { id: string; name: string; description: string | null; max_selections: number; voted: boolean };
export type BallotCandidate = { id: string; position_id: string; full_name: string; department: string | null; year_label: string | null; intro: string | null; manifesto: string | null; symbol: string | null; has_photo: boolean };
type Sel = Record<string, string[] | "abstain">;

export function Ballot({ slug, title, closesLabel, allowAbstain, requireAll, positions, candidates, preview }: {
  slug: string; title: string; closesLabel: string; allowAbstain: boolean; requireAll: boolean;
  positions: BallotPosition[]; candidates: BallotCandidate[]; preview?: boolean;
}) {
  const router = useRouter();
  const open = positions.filter((p) => !p.voted);
  const [step, setStep] = useState(0); // 0..open.length-1 = positions, open.length = review
  const [sel, setSel] = useState<Sel>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const idemKey = useMemo(() => {
    if (typeof window === "undefined" || preview) return "preview";
    const k = `vapp-idem-${slug}`;
    let v = sessionStorage.getItem(k);
    if (!v) { v = crypto.randomUUID() + crypto.randomUUID().slice(0, 8); sessionStorage.setItem(k, v); }
    return v;
  }, [slug, preview]);
  // Verification code: lives only in this browser and next to the anonymous ballot, never with the voter.
  const checkCode = useMemo(() => {
    if (typeof window === "undefined" || preview) return undefined;
    const k = `vapp-check-${slug}`;
    let v = sessionStorage.getItem(k);
    if (!v) {
      const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const b = crypto.getRandomValues(new Uint32Array(12));
      const c = Array.from(b, (x) => A[x % A.length]).join("");
      v = `VC-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
      sessionStorage.setItem(k, v);
    }
    return v;
  }, [slug, preview]);

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { if (confirming) dlg.current?.showModal(); else dlg.current?.close(); }, [confirming]);

  const reviewing = step >= open.length;
  const pos = open[step];
  const chosen = (pid: string) => (sel[pid] === "abstain" ? [] : (sel[pid] as string[] | undefined) ?? []);
  const answered = open.filter((p) => sel[p.id] === "abstain" || chosen(p.id).length > 0);
  const missing = open.filter((p) => !answered.includes(p));

  function toggle(p: BallotPosition, cid: string) {
    setError(null);
    setSel((s) => {
      const cur = s[p.id] === "abstain" ? [] : ((s[p.id] as string[]) ?? []);
      if (p.max_selections === 1) return { ...s, [p.id]: cur[0] === cid ? [] : [cid] };
      if (cur.includes(cid)) return { ...s, [p.id]: cur.filter((x) => x !== cid) };
      if (cur.length >= p.max_selections) { setError(`You can choose up to ${p.max_selections} candidates for ${p.name}. Deselect one first.`); return s; }
      return { ...s, [p.id]: [...cur, cid] };
    });
  }

  async function submit() {
    if (preview) { setConfirming(false); setError("Preview mode, ballots can't be submitted from here."); return; }
    setSubmitting(true); setError(null);
    const choices = answered.map((p) => ({ position_id: p.id, candidate_ids: sel[p.id] === "abstain" ? [] : chosen(p.id) }));
    try {
      const res = await fetch(`/e/${slug}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: idemKey, checkCode, choices }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Your ballot could not be submitted. Nothing was recorded. Please try again.");
        if (data.code === "SESSION_INVALID") setTimeout(() => router.replace(`/e/${slug}/verify?expired=1`), 1800);
        setSubmitting(false); setConfirming(false); return;
      }
      sessionStorage.removeItem(`vapp-idem-${slug}`);
      sessionStorage.removeItem(`vapp-check-${slug}`);
      sessionStorage.setItem(`vapp-receipt-${slug}`, JSON.stringify({ ...data, checkCode: data.accepted > 0 ? checkCode : null }));
      router.replace(`/e/${slug}/done`);
    } catch {
      // Network failure: the same idempotency key makes a retry safe, it can never create a second ballot.
      setError("Network problem. Check your connection and press Submit again. Retrying is safe and can't count your vote twice.");
      setSubmitting(false); setConfirming(false);
    }
  }

  if (open.length === 0) {
    return <div className="rounded-2xl border border-g200 p-6 text-center"><p className="font-semibold">You've voted for every position available to you.</p><p className="mt-1 text-sm text-g500">Thank you for voting. Every valid vote counts.</p></div>;
  }

  const total = open.length + 1;
  return (
    <div className="pb-28">
      <div className="sticky top-0 z-20 -mx-4 border-b border-g100 bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <div className="flex items-center justify-between text-xs text-g500"><span className="truncate pr-3">{title}</span><span className="shrink-0">Closes {closesLabel}</span></div>
        <div className="mt-2 flex gap-1" aria-hidden>{Array.from({ length: total }).map((_, i) => <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < step ? "bg-ink" : i === step ? "bg-lime" : "bg-g100")} />)}</div>
        <p className="sr-only" aria-live="polite">{reviewing ? "Review your selections" : `Position ${step + 1} of ${open.length}: ${pos.name}`}</p>
      </div>

      {positions.some((p) => p.voted) && step === 0 && (
        <p className="mt-4 rounded-xl bg-g50 px-4 py-3 text-sm text-g600">Already submitted: {positions.filter((p) => p.voted).map((p) => p.name).join(", ")}. Those choices are final and aren't shown again.</p>
      )}

      {!reviewing ? (
        <fieldset className="mt-6 animate-in" key={pos.id}>
          <legend className="w-full">
            <span className="eyebrow block text-g500">Position {step + 1} of {open.length}</span>
            <h2 ref={heading} tabIndex={-1} className="mt-1 text-[1.7rem] font-semibold leading-tight outline-none">{pos.name}</h2>
            <span className="mt-1 block text-sm text-g600">{pos.max_selections === 1 ? "Choose one candidate." : `Choose up to ${pos.max_selections} candidates.`}{pos.description ? ` ${pos.description}` : ""}</span>
          </legend>
          <div className="mt-5 space-y-3">
            {candidates.filter((c) => c.position_id === pos.id).map((c) => {
              const on = chosen(pos.id).includes(c.id);
              return (
                <div key={c.id} className={cx("rounded-2xl border-2 transition-colors", on ? "border-ink bg-lime/15" : "border-g200 hover:border-g400")}>
                  <label className="flex cursor-pointer items-center gap-4 p-4">
                    <input type={pos.max_selections === 1 ? "radio" : "checkbox"} name={`pos-${pos.id}`} value={c.id} checked={on} onChange={() => toggle(pos, c.id)}
                      onClick={(e) => { if (pos.max_selections === 1 && on) { e.preventDefault(); toggle(pos, c.id); } }} className="peer sr-only" />
                    <Avatar id={c.id} name={c.full_name} hasPhoto={c.has_photo} size={56} selected={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.05rem] font-semibold">{c.full_name}</span>
                      <span className="block text-sm text-g500">{[c.department, c.year_label, c.symbol && `Symbol: ${c.symbol}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span aria-hidden className={cx("grid size-7 shrink-0 place-items-center border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2",
                      pos.max_selections === 1 ? "rounded-full" : "rounded-lg", on ? "border-ink bg-ink" : "border-g300")}>
                      {on && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.4 5.8 10 11 4" stroke="#C6F36B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                  </label>
                  {(c.intro || c.manifesto) && (
                    <div className="px-4 pb-4 -mt-1 pl-[5.5rem] text-sm text-g600">
                      {c.intro && <p>{c.intro}</p>}
                      {c.manifesto && <details className="mt-1"><summary className="cursor-pointer text-ink underline underline-offset-2">Read manifesto</summary><p className="mt-2 whitespace-pre-line">{c.manifesto}</p></details>}
                    </div>
                  )}
                </div>
              );
            })}
            {allowAbstain && (
              <label className={cx("flex cursor-pointer items-center justify-between rounded-2xl border-2 border-dashed p-4 text-sm", sel[pos.id] === "abstain" ? "border-ink bg-g50" : "border-g200")}>
                <span><span className="font-medium">Abstain</span><span className="block text-g500">Record that you chose not to vote for any candidate.</span></span>
                <input type="checkbox" checked={sel[pos.id] === "abstain"} onChange={(e) => setSel((s) => ({ ...s, [pos.id]: e.target.checked ? "abstain" : [] }))} className="size-5 accent-ink" />
              </label>
            )}
          </div>
        </fieldset>
      ) : (
        <section className="mt-6 animate-in" aria-labelledby="review-h">
          <h2 id="review-h" ref={heading} tabIndex={-1} className="text-[1.7rem] font-semibold outline-none">Review your ballot</h2>
          <p className="mt-1 text-sm text-g600">Check each choice. After you submit, your ballot can't be changed.</p>
          <ul className="mt-5 divide-y divide-g100 rounded-2xl border border-g200">
            {open.map((p, i) => {
              const c = chosen(p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-g500">{p.name}</p>
                    <p className="font-medium">{sel[p.id] === "abstain" ? "Abstain" : c.length ? c.map((id) => candidates.find((x) => x.id === id)?.full_name).join(", ") : <span className="text-g400">No selection, {requireAll ? "required" : "not submitted"}</span>}</p>
                  </div>
                  <button type="button" onClick={() => setStep(i)} className="shrink-0 rounded-full border border-g300 px-3 py-1.5 text-sm hover:border-ink">Change</button>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && !requireAll && <p className="mt-3 text-sm text-g600">Positions without a selection won't be submitted now. You can come back and vote for them while voting is open.</p>}
          {missing.length > 0 && requireAll && <p className="mt-3 text-sm text-danger">This election requires a choice (or abstention) for every position.</p>}
        </section>
      )}

      {error && <p role="alert" className="mt-5 rounded-xl border border-[#fecdca] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-g200 bg-paper/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="h-12 rounded-full border border-g300 px-5 font-medium disabled:opacity-40">Back</button>
          {!reviewing ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="h-12 flex-1 rounded-full bg-ink font-medium text-paper">
              {step === open.length - 1 ? "Review ballot" : chosen(pos.id).length || sel[pos.id] === "abstain" ? "Next position" : "Skip for now"}
            </button>
          ) : (
            <button type="button" disabled={answered.length === 0 || (requireAll && missing.length > 0)} onClick={() => setConfirming(true)} className="h-12 flex-1 rounded-full bg-lime font-semibold text-ink disabled:opacity-40">
              Submit ballot{answered.length ? ` (${answered.length})` : ""}
            </button>
          )}
        </div>
      </div>

      <dialog ref={dlg} onClose={() => setConfirming(false)} className="m-auto w-[min(92vw,26rem)] rounded-2xl p-0 backdrop:bg-ink/60" aria-labelledby="confirm-h">
        <div className="p-6">
          <h2 id="confirm-h" className="text-lg font-semibold">Submit your ballot?</h2>
          <p className="mt-2 text-sm text-g600">You're submitting {answered.length} position{answered.length === 1 ? "" : "s"}. Once submitted, these choices are final and can't be changed by you or anyone else.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-full border border-g300 px-5 text-sm font-medium">Go back</button>
            <button type="button" onClick={submit} disabled={submitting} aria-busy={submitting} className="h-11 rounded-full bg-lime px-5 text-sm font-semibold text-ink disabled:opacity-60">
              {submitting ? "Submitting…" : "Yes, submit my ballot"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
