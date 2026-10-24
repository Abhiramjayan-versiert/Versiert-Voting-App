import { loadElection } from "@/lib/election-page";
import { readiness } from "@/lib/elections";
import { withCtx } from "@/lib/db";
import { Card, Notice, fmtDate, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { WizardSteps } from "@/components/wizard";
import { lifecycleAction } from "@/app/college/actions";

export const metadata = { title: "Review & open" };
export default async function Review({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e, base } = await loadElection(cid, eid);
  const r = await readiness(ctx, eid);
  const cands = await withCtx(ctx, (tx) => tx`select position_id, full_name, status from candidates where election_id = ${eid} order by sort_order`);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]"><dt className="text-sm text-g500">{k}</dt><dd className="text-sm">{v}</dd></div>;
  return (
    <>
      {e.status === "draft" && <WizardSteps current="review" base={base} done={{ details: true, voters: true, positions: true, rules: true }} />}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <h2 className="text-lg font-semibold">Election summary</h2>
          <dl className="mt-2 divide-y divide-g100">
            <Row k="Event" v={<>{e.event_name}<br /><span className="text-g500">{e.title}{e.academic_year ? ` · ${e.academic_year}` : ""}</span></>} />
            <Row k="Voting window" v={<>{fmtDate(e.starts_at, e.timezone, "full")}<br />→ {fmtDate(e.ends_at, e.timezone, "full")} <span className="text-g500">({e.timezone})</span></>} />
            <Row k="Eligible voters" v={`${r.voters.toLocaleString("en-IN")} on the list · each verifies with the uploaded email + student ID`} />
            <Row k="Positions & candidates" v={<ul className="space-y-2">{r.positions.map((p) => (
              <li key={p.id}><span className="font-medium">{p.name}</span> <span className="text-g500">· {p.max_selections === 1 ? "1 choice" : `up to ${p.max_selections}`}{p.eligible_groups?.length ? ` · groups ${p.eligible_groups.join(", ")}` : ""}</span>
                <span className="block text-g600">{cands.filter((c) => c.position_id === p.id).map((c) => c.full_name).join(", ") || "—"}</span></li>))}</ul>} />
            <Row k="Voting rules" v={<>{e.secret_ballot ? "Secret ballot" : <Badge tone="warning">Open ballot — choices linked to voters</Badge>} · one vote per position per voter · {e.allow_abstain ? "abstention allowed" : "no abstention"} · {e.require_all_positions ? "all positions required" : "partial ballots allowed"}</>} />
            <Row k="Results" v={<>Hidden from students until published · {e.results_require_approval ? "you approve publication" : "auto-publish at close if integrity checks pass"} · {e.admin_live_results ? "live tallies visible to administrators" : "no live tallies"}</>} />
            <Row k="Retention & deletion" v={<>Voter list, verification and ballot data deleted <strong>{e.retention_days} day{e.retention_days === 1 ? "" : "s"}</strong> after publication. {e.keep_public_results ? "Aggregate results page kept." : "Results page also removed."}</>} />
          </dl>
        </Card>
        <div className="space-y-4">
          {e.status !== "draft" ? <Notice tone="info" title="Already activated">This election is {e.effective}. Its configuration can no longer change.</Notice> : !r.ok ? (
            <Notice tone="warning" title="Not ready yet"><ul className="mt-1 list-disc pl-5">{r.issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice>
          ) : (
            <Card className="border-ink">
              <h2 className="font-semibold">Activate election</h2>
              <p className="mt-1 text-sm text-g600">Voting opens automatically at the start time. After activation, positions, candidates, rules and the voter list are locked; before voting starts you can return it to draft.</p>
              <ActionForm action={lifecycleAction} className="mt-4 space-y-4">
                <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="op" value="activate" />
                <label className="flex gap-3 text-sm"><input type="checkbox" name="ack" required className="mt-0.5 size-4 accent-ink" />I have reviewed the schedule, voter list, positions, candidates, rules and retention policy.</label>
                <SubmitButton variant="primary" className="w-full" pendingText="Activating…">Activate election</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <ButtonLink href={`${base}/preview`} variant="outline" className="w-full">Preview the ballot as a student</ButtonLink>
        </div>
      </div>
    </>
  );
}
