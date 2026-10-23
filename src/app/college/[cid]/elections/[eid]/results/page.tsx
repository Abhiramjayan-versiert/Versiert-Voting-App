import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { computeElection, integrityReport } from "@/lib/elections";
import { CORRECTION_WINDOW_HOURS } from "@/lib/jobs";
import { Card, Notice, Badge, Stat, fmtDate, ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton, Confirm, CopyButton, PrintButton } from "@/components/forms";
import { ResultsView } from "@/components/results-view";
import { lifecycleAction } from "@/app/college/actions";
import { env } from "@/lib/env";

export const metadata = { title: "Results" };
export default async function Results({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e } = await loadElection(cid, eid);
  const st = e.effective as string;
  if (["draft", "scheduled"].includes(st)) return <Notice tone="info">Results will appear here once voting has started{e.admin_live_results ? "" : " and closed"}.</Notice>;
  if (st === "deleted") {
    const [snap] = await withCtx(ctx, (tx) => tx`select data, created_at from result_snapshots where election_id = ${eid} order by created_at desc limit 1`);
    return snap ? <><Notice tone="info" className="mb-5">Election data has been deleted. This is the retained published snapshot.</Notice><ResultsView r={snap.data.results} /></> : <Notice tone="info">This election's data and results were deleted under its retention policy.</Notice>;
  }
  if ((st === "open" || st === "paused") && !e.admin_live_results) return <Notice tone="info">Live tallies are off for this election. Results appear after voting closes.</Notice>;
  const d = await withCtx(ctx, async (tx) => ({
    r: await computeElection(eid, tx),
    integrity: ["results_pending", "published", "retention"].includes(st) ? await integrityReport(eid, tx) : null,
    history: await tx`select h.action, h.created_at, h.note, u.email from publication_history h left join users u on u.id = h.actor_id where h.election_id = ${eid} order by h.created_at desc`,
  }));
  const published = st === "published" || st === "retention";
  const H = { election_id: eid };
  const link = `${env().APP_URL}/r/${e.public_ref}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={published ? "published" : "results_pending"}>{published ? `Published ${fmtDate(e.published_at, e.timezone)}` : st === "results_pending" ? "Provisional — awaiting your review" : "Provisional — voting in progress"}</Badge>
        <div className="flex gap-2">{published && <><CopyButton text={link} label="Copy public link" /><ButtonLink href={`/r/${e.public_ref}`} variant="outline" size="sm">Open public page</ButtonLink></>}<PrintButton /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Eligible voters" value={d.r.eligibleVoters.toLocaleString("en-IN")} />
        <Stat label="Participated" value={d.r.participatingVoters.toLocaleString("en-IN")} />
        <Stat accent label="Overall turnout" value={`${d.r.turnoutPct.toFixed(1)}%`} />
      </div>

      {d.integrity && (
        <Card>
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Integrity checks</h2><Badge tone={d.integrity.ok ? "completed" : "failed"}>{d.integrity.ok ? "All passed" : "Attention needed"}</Badge></div>
          <ul className="mt-3 space-y-2 text-sm">{d.integrity.checks.map((c) => (
            <li key={c.name} className="flex gap-3"><span aria-hidden className={c.ok ? "text-ink" : "text-danger"}>{c.ok ? "✓" : "✕"}</span><span><span className={c.ok ? "" : "font-medium text-danger"}>{c.name}</span><span className="block text-xs text-g500">{c.detail}</span></span></li>))}</ul>
          {d.integrity.openIncidents.length > 0 && (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-semibold">Unresolved incidents</h3>
              {d.integrity.openIncidents.map((i) => (
                <div key={i.id} className="rounded-xl border border-[#f0d58a] bg-warn-soft p-3 text-sm">
                  <p className="font-medium text-warn">{i.kind.replace(/_/g, " ")} · {fmtDate(i.at, e.timezone)}</p>
                  <p className="mt-1 text-g700">{(i.details as { description?: string }).description ?? JSON.stringify(i.details)}</p>
                  <ActionForm action={lifecycleAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="op" value="resolve" /><input type="hidden" name="incident_id" value={i.id} />
                    <input name="reason" required minLength={10} placeholder="What was checked and decided" aria-label="Resolution" className="h-10 flex-1 rounded-full border border-g300 bg-paper px-4 text-sm" />
                    <SubmitButton size="sm">Mark resolved</SubmitButton>
                  </ActionForm>
                </div>))}
            </div>
          )}
        </Card>
      )}

      {st === "results_pending" && (
        <Card className="border-ink">
          <h2 className="font-semibold">Publish results</h2>
          <p className="mt-1 text-sm text-g600">Publishing freezes an immutable snapshot of these totals and makes them visible at the public results link. Ties are shown as ties.{e.allow_unpublish ? ` You can unpublish within ${CORRECTION_WINDOW_HOURS} hours if a correction is needed.` : ""}</p>
          {d.integrity?.ok ? (
            <ActionForm action={lifecycleAction} className="mt-4 space-y-4">
              <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="op" value="publish" />
              <label className="flex gap-3 text-sm"><input type="checkbox" name="ack" required className="mt-0.5 size-4 accent-ink" />Voting has closed, I have reviewed these results, and all integrity checks have passed.</label>
              <SubmitButton variant="primary" pendingText="Publishing…">Publish results</SubmitButton>
            </ActionForm>
          ) : <Notice tone="warning" className="mt-4">Resolve the items above before publishing.</Notice>}
        </Card>
      )}
      {st === "published" && e.allow_unpublish && (
        <Confirm triggerClass="text-sm text-g600 underline hover:text-danger" trigger="Unpublish results (correction window)…" title="Unpublish results?" tone="danger" confirmLabel="Unpublish"
          body={<p>The public page stops showing results and the election returns to review. The previous snapshot stays in the history.</p>} action={lifecycleAction} hidden={{ ...H, op: "unpublish" }} reasonLabel="Reason (audit-logged)" />
      )}

      <ResultsView r={d.r} provisional={!published} />

      {d.history.length > 0 && (
        <Card><h2 className="mb-3 font-semibold">Publication history</h2>
          <ul className="space-y-2 text-sm">{d.history.map((h, i) => <li key={i}><Badge tone={h.action === "publish" ? "published" : "warning"}>{h.action}</Badge> <span className="text-g600">{fmtDate(h.created_at, e.timezone)} · {h.email ?? "automatic"}{h.note ? ` · ${h.note}` : ""}</span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
