import Link from "next/link";
import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { electionsWithStats } from "@/lib/college-data";
import { readiness } from "@/lib/elections";
import { PageHeader, Stat, Card, Badge, ButtonLink, Empty, Progress, fmtDate, relTime } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/lifecycle";
import { pct } from "@/lib/results";

export const metadata = { title: "Dashboard" };
export default async function Dashboard({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const { s, ctx } = await requireCollegeAdmin(cid);
  const d = await withCtx(ctx, async (tx) => {
    const els = await electionsWithStats(tx, cid);
    const active = els.filter((e) => e.effective === "open" || e.effective === "paused");
    const posTurnout = active.length ? await tx`
      select e.id as election_id, p.name, p.sort_order,
        (select count(*)::int from voters v where v.election_id = e.id and app.voter_eligible_for_position(v.voter_group, p.eligible_groups)) as eligible,
        (select count(*)::int from participations pa where pa.position_id = p.id) as voted
      from positions p join elections e on e.id = p.election_id where e.id = any(${active.map((a) => a.id)}::uuid[]) order by p.sort_order` : [];
    const activity = s.user.role === "super_admin" ? await tx`select at, actor_label, action, target from audit_events where college_id = ${cid} order by id desc limit 8` : [];
    return { els, posTurnout, activity };
  });
  const by = (st: string[]) => d.els.filter((e) => st.includes(e.effective));
  const active = by(["open", "paused"]), upcoming = by(["scheduled"]), drafts = by(["draft"]), completed = by(["closed", "results_pending", "published", "retention", "deleted"]);
  const live = [...active, ...completed.filter((e) => e.effective !== "deleted")];
  const totVoters = live.reduce((s, e) => s + e.voters, 0), totPart = live.reduce((s, e) => s + e.participants, 0);
  const tasks: { t: string; href: string }[] = [];
  for (const e of drafts) {
    const r = await readiness(ctx, e.id);
    if (!r.ok) tasks.push({ t: `${e.title}: ${r.issues[0]}${r.issues.length > 1 ? ` (+${r.issues.length - 1} more)` : ""}`, href: `/college/${cid}/elections/${e.id}` });
    else tasks.push({ t: `${e.title} is ready, review and activate it`, href: `/college/${cid}/elections/${e.id}/review` });
  }
  for (const e of by(["results_pending"])) tasks.push({ t: `${e.title}: results are waiting for your review`, href: `/college/${cid}/elections/${e.id}/results` });
  for (const e of d.els.filter((x) => x.flags > 0)) tasks.push({ t: `${e.title}: ${e.flags} integrity incident(s) to resolve`, href: `/college/${cid}/elections/${e.id}/results` });

  return (
    <>
      <PageHeader eyebrow={`Welcome, ${s.user.name.split(" ")[0]}`} title="Election dashboard" actions={<ButtonLink href={`/college/${cid}/elections/new`} variant="primary">New election</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat accent label="Active elections" value={active.length} sub={active.length ? `${active.filter((a) => a.effective === "paused").length} paused` : "None open"} />
        <Stat label="Upcoming" value={upcoming.length} sub={`${drafts.length} draft${drafts.length === 1 ? "" : "s"}`} />
        <Stat label="Completed" value={completed.length} sub={`${by(["published", "retention"]).length} published · ${by(["results_pending"]).length} pending`} />
        <Stat label="Overall participation" value={`${pct(totPart, totVoters).toFixed(1)}%`} sub={`${totPart.toLocaleString("en-IN")} of ${totVoters.toLocaleString("en-IN")} eligible voters`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          {active.length > 0 && active.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><Link href={`/college/${cid}/elections/${e.id}/monitor`} className="text-lg font-semibold hover:underline">{e.title}</Link>
                  <p className="text-sm text-g500">Closes {fmtDate(e.ends_at, e.timezone)} · {relTime(e.ends_at)}</p></div>
                <Badge tone={e.effective}>{STATUS_LABEL[e.effective as keyof typeof STATUS_LABEL]}</Badge>
              </div>
              <div className="mt-4 flex items-baseline justify-between text-sm"><span>Turnout</span><span className="tabular font-medium">{e.participants} / {e.voters} · {pct(e.participants, e.voters).toFixed(1)}%</span></div>
              <div className="mt-2"><Progress value={pct(e.participants, e.voters)} label={`Turnout for ${e.title}`} /></div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">{d.posTurnout.filter((p) => p.election_id === e.id).map((p) => (
                <li key={p.name} className="text-sm"><div className="flex justify-between"><span className="text-g600">{p.name}</span><span className="tabular">{pct(p.voted, p.eligible).toFixed(0)}%</span></div>
                  <div className="mt-1.5"><Progress value={pct(p.voted, p.eligible)} label={`${p.name} turnout`} /></div></li>))}
              </ul>
            </Card>
          ))}
          <Card>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">All elections</h2><Link href={`/college/${cid}/elections`} className="text-sm text-g500 hover:text-ink">View all</Link></div>
            {d.els.length === 0 ? <Empty title="No elections yet" action={<ButtonLink href={`/college/${cid}/elections/new`} variant="primary">Create your first election</ButtonLink>}>The setup wizard walks you through voters, positions, candidates and rules.</Empty> : (
              <ul className="divide-y divide-g100">{d.els.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/college/${cid}/elections/${e.id}`} className="min-w-0 hover:underline"><span className="block truncate font-medium">{e.title}</span>
                    <span className="block text-xs text-g500">{e.effective === "scheduled" ? `Opens ${fmtDate(e.starts_at, e.timezone)}` : e.effective === "open" ? `Closes ${fmtDate(e.ends_at, e.timezone)}` : e.published_at ? `Published ${fmtDate(e.published_at, e.timezone)}` : `${e.positions} position${e.positions === 1 ? "" : "s"} · ${e.voters} voter${e.voters === 1 ? "" : "s"}`}</span></Link>
                  <Badge tone={e.effective}>{STATUS_LABEL[e.effective as keyof typeof STATUS_LABEL]}</Badge>
                </li>))}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">To do</h2>
            {tasks.length === 0 ? <p className="text-sm text-g500">Nothing needs your attention.</p> : (
              <ul className="space-y-2">{tasks.map((t, i) => (
                <li key={i}><Link href={t.href} className="flex gap-3 rounded-xl border border-g200 p-3 text-sm hover:border-ink"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-lime ring-2 ring-ink" aria-hidden />{t.t}</Link></li>))}</ul>
            )}
          </Card>
          {s.user.role !== "super_admin" ? <Card><h2 className="font-semibold">Recent activity</h2><p className="mt-1 text-sm text-g600">The activity log is available to the platform administrator only. Contact the admin if you need it.</p></Card> : <Card>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent activity</h2><Link href={`/college/${cid}/audit`} className="text-sm text-g500 hover:text-ink">Activity log</Link></div>
            <ul className="space-y-3 text-sm">{d.activity.map((r, i) => (
              <li key={i}><span className="font-mono text-[0.78rem]">{r.action}</span> <span className="text-g600">{r.target}</span><span className="block text-xs text-g500">{r.actor_label} · {relTime(r.at)}</span></li>))}
            </ul>
          </Card>}
        </div>
      </div>
    </>
  );
}
