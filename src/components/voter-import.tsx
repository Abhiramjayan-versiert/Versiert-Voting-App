"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import type { Action, ActionState } from "./forms";
import { Notice, cx } from "./ui";

type Preview = {
  filename: string; headers: string[]; sample: string[][]; total: number; truncated: boolean; maxRows: number;
  mapping: { email: number; name: number | null; studentId: number | null; group: number | null };
  accepted: number; rejected: { row: number; reason: string; raw: Record<string, string> }[]; rejectedCount: number; duplicates: number;
};

function csvCell(v: string) {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadRejected(p: Preview) {
  const cols = ["Row", "Reason", ...p.headers];
  const lines = [cols, ...p.rejected.map((r) => [String(r.row), r.reason, ...p.headers.map((h) => r.raw[h] ?? "")])].map((l) => l.map(csvCell).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rejected-rows-${p.filename.replace(/\.[^.]+$/, "")}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Btn({ children, onRun, variant, disabled, pending }: { children: React.ReactNode; onRun: () => void; variant: "dark" | "primary" | "outline"; disabled?: boolean; pending: boolean }) {
  return (
    <button type="button" onClick={onRun} disabled={pending || disabled} aria-busy={pending}
      className={cx("inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium disabled:opacity-50",
        variant === "primary" ? "bg-lime text-ink hover:bg-lime-deep" : variant === "dark" ? "bg-ink text-paper" : "border border-g300 hover:border-ink")}>
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}{children}
    </button>
  );
}

export function VoterImport({ electionId, previewAction, commitAction, maxMb }: { electionId: string; previewAction: Action; commitAction: Action; maxMb: number }) {
  const [pState, preview, previewing] = useActionState(previewAction, null as ActionState);
  const [cState, commit, committing] = useActionState(commitAction, null as ActionState);
  // Never let React auto-reset this form: the chosen file must survive between Preview and Import.
  const runWith = (fn: (fd: FormData) => void) => () => { if (formRef.current) { const fd = new FormData(formRef.current); startTransition(() => fn(fd)); } };
  const busy = previewing || committing;
  const [fileKey, setFileKey] = useState(0);
  const [hasFile, setHasFile] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const p = (pState?.ok ? pState.data : null) as Preview | null;
  const committed = cState?.ok;
  const opt = (sel: number | null, allowNone = true) => (
    <>{allowNone && <option value="-1">(not in file)</option>}{p?.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</>
  );

  return (
    <form ref={formRef} className="space-y-5" onSubmit={(e) => e.preventDefault()} onChange={(e) => { if ((e.target as unknown as HTMLInputElement).name === "file") { setHasFile(!!(e.target as unknown as HTMLInputElement).files?.length); } }}>
      <input type="hidden" name="election_id" value={electionId} />
      <div className="rounded-xl border-2 border-dashed border-g300 p-5 text-center has-[:focus-visible]:border-ink">
        <label htmlFor="file" className="block cursor-pointer">
          <span className="font-medium">Choose a voter spreadsheet</span>
          <span className="mt-1 block text-sm text-g500">.xlsx, .xls or .csv · up to {maxMb} MB · first sheet, header in row 1 · one row per student</span>
        </label>
        <input key={fileKey} id="file" name="file" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="mx-auto mt-3 block text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-paper" required />
        <p className="mt-2 text-xs text-g500">The file is read in memory to build the voter list and is never stored.</p>
      </div>

      {p && !committed && (
        <div className="space-y-5 animate-in">
          <div>
            <h3 className="font-medium">Match your columns</h3>
            <p className="text-sm text-g500">We guessed from the headers. Change any mapping, then re-check.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {([["map_email", "Email (required)", p.mapping.email, false], ["map_name", "Name", p.mapping.name, true], ["map_student_id", "Student ID (required)", p.mapping.studentId, false], ["map_group", "Group / department", p.mapping.group, true]] as const).map(([n, l, v, none]) => (
                <div key={n}><label htmlFor={n} className="text-sm font-medium">{l}</label>
                  <select id={n} name={n} defaultValue={v ?? -1} className="mt-1 h-10 w-full rounded-lg border border-g300 px-2 text-sm">{opt(v, none)}</select></div>
              ))}
            </div>
            <p className="mt-2 text-xs text-g500">“Group” enables position-specific eligibility (e.g. only CSE students vote for CSE Representative).</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-lime p-3"><p className="text-2xl font-semibold tabular">{p.accepted}</p><p className="text-xs">ready to import</p></div>
            <div className="rounded-xl border border-g200 p-3"><p className="text-2xl font-semibold tabular">{p.rejectedCount - p.duplicates}</p><p className="text-xs text-g500">invalid / missing</p></div>
            <div className="rounded-xl border border-g200 p-3"><p className="text-2xl font-semibold tabular">{p.duplicates}</p><p className="text-xs text-g500">duplicates</p></div>
          </div>
          {p.truncated && <Notice tone="warning">Only the first {p.maxRows.toLocaleString("en-IN")} rows were read. Split larger lists into several files.</Notice>}
          <div className="overflow-x-auto rounded-xl border border-g200">
            <table className="w-full min-w-[480px] text-left text-xs"><caption className="sr-only">First rows of the uploaded file</caption>
              <thead className="bg-g50"><tr>{p.headers.map((h, i) => <th key={i} className="px-3 py-2 font-medium text-g600">{h}</th>)}</tr></thead>
              <tbody>{p.sample.map((r, i) => <tr key={i} className="border-t border-g100">{r.map((c, j) => <td key={j} className="max-w-48 truncate px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {p.rejectedCount > 0 && (
            <details className="rounded-xl border border-g200 p-4">
              <summary className="cursor-pointer text-sm font-medium">Show rejected rows ({p.rejectedCount})</summary>
              <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">{p.rejected.slice(0, 200).map((r) => <li key={r.row}><span className="font-mono text-g500">Row {r.row}:</span> {r.reason}</li>)}</ul>
              <button type="button" onClick={() => downloadRejected(p)} className="mt-3 inline-flex h-9 items-center rounded-full border border-g300 px-4 text-sm hover:border-ink">Download rejected rows (.csv)</button>
            </details>
          )}
        </div>
      )}

      {pState?.ok && pState.message && !committed && <Notice tone="warning">{pState.message}</Notice>}
      {pState?.error && <Notice tone="error">{pState.error}</Notice>}
      {cState?.error && <Notice tone="error">{cState.error}</Notice>}
      {committed && (
        <Notice tone="success" title="Import complete">
          {cState?.message}
          {(cState?.data as { rejected?: number; importId?: string })?.rejected ? <> <a className="underline" href={`/api/exports/${electionId}/import-errors?import=${(cState?.data as { importId: string }).importId}`}>Download rejected-row report</a>.</> : null}
          <button type="button" className="ml-2 underline" onClick={() => { setFileKey((k) => k + 1); setHasFile(false); formRef.current?.reset(); location.reload(); }}>Import another file</button>
        </Notice>
      )}

      {!committed && (
        <div className="flex flex-wrap gap-2">
          <Btn onRun={runWith(preview)} pending={busy} variant={p ? "outline" : "dark"} disabled={!hasFile}>{p ? "Re-check with these columns" : "Preview import"}</Btn>
          {p && <Btn onRun={runWith(commit)} pending={busy} variant="primary" disabled={!hasFile || p.accepted === 0}>Import {p.accepted} voter{p.accepted === 1 ? "" : "s"}</Btn>}
        </div>
      )}
    </form>
  );
}
