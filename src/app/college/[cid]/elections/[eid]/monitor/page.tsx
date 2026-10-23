import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { computeElection } from "@/lib/elections";
import { Card, Stat, Progress, Notice, fmtDate, relTime } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { ResultsView } from "@/components/results-view";
import { pct } from "@/lib/results";

export const metadata = { title: "Live monitor" };
export default async function Monitor({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e } = await loadElection(cid, eid);
  const st = e.effective as string;
  if (st === "draft") return <Notice tone="info">Live monitoring starts once the election is activated.</Notice>;
  const d = await withCtx(ctx, async (tx) => ({
    r: await computeElection(eid, tx),
    hourly: await tx`select date_trunc('hour', created_at) as h, count(distinct voter_id)::int as n from participations where election_id = ${eid} group by 1 order by 1 desc limit 24`,
    flags: await tx`select count(*)::int as n from security_events where election_id = ${eid} and requires_review and resolved_at is null`,
    dup: await tx`select count(*)::int as n from security_events where election_id = ${eid} and kind = 'duplicate_vote_attempt'`,
    sessions: await tx`select count(*)::int as n from voter_sessions where election_id = ${eid} and revoked_at is null and expires_at > now()`,
  }));
  const showTallies = e.admin_live_results || !["open", "paused", "scheduled"].includes(st);
  const max = Math.max(1, ...d.hourly.map((h) => h.n));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-g600">{st === "open" ? <>Voting closes {fmtDate(e.ends_at, e.timezone)} ({relTime(e.ends_at)}).</> : st === "scheduled" ? <>Voting opens {fmtDate(e.starts_at, e.timezone)}.</> : <>Voting is {st.replace("_", " ")}.</>}</p>
        {(st === "open" || st === "paused") && <AutoRefresh seconds={15} />}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Turnout" value={`${d.r.turnoutPct.toFixed(1)}%`} sub={`${d.r.participatingVoters} of ${d.r.eligibleVoters} voters`} />
        <Stat label="Voting right now" value={d.sessions[0].n} sub="verified sessions active" />
        <Stat label="Duplicate attempts blocked" value={d.dup[0].n} sub="first ballot always kept" />
        <Stat label="Open incidents" value={d.flags[0].n} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Turnout by position</h2>
          <ul className="space-y-4">{d.r.positions.map((p) => (
            <li key={p.id}><div className="flex justify-between text-sm"><span>{p.name}</span><span className="tabular text-g600">{p.participants}/{p.eligible} · {pct(p.participants, p.eligible).toFixed(1)}%</span></div>
              <div className="mt-1.5"><Progress value={pct(p.participants, p.eligible)} label={`${p.name} turnout`} /></div></li>))}</ul>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">New voters per hour</h2>
          {d.hourly.length === 0 ? <p className="text-sm text-g500">No ballots yet.</p> : (
            <ul className="space-y-1.5">{[...d.hourly].reverse().map((h) => (
              <li key={String(h.h)} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-xs">
                <span className="text-g500">{fmtDate(h.h, e.timezone).split(", ").slice(-1)[0]}</span>
                <span className="h-2 rounded-full bg-g100"><span className="block h-full rounded-full bg-ink" style={{ width: `${(h.n / max) * 100}%` }} /></span>
                <span className="tabular text-right">{h.n}</span>
              </li>))}</ul>
          )}
        </Card>
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">{st === "open" || st === "paused" ? "Live tallies (provisional)" : "Tallies"}</h2>
        {showTallies ? <>
          {(st === "open" || st === "paused") && <Notice tone="info" className="mb-4">Visible to administrators only. Students and the public see nothing until you publish.</Notice>}
          <ResultsView r={d.r} provisional />
        </> : <Notice tone="info">Live tallies are turned off for this election. Results appear here after voting closes.</Notice>}
      </div>
    </div>
  );
}
