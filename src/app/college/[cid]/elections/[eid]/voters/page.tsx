import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { Card, Notice, Table, Badge, Field, Input, fmtDate, Empty, ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton, Confirm } from "@/components/forms";
import { VoterImport } from "@/components/voter-import";
import { WizardSteps } from "@/components/wizard";
import { previewImportAction, commitImportAction, addVoterAction, removeVotersAction, issueVotingPassAction } from "@/app/college/actions";

export const metadata = { title: "Eligible voters" };
const PAGE = 50;

export default async function Voters({ params, searchParams }: { params: Promise<{ cid: string; eid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { cid, eid } = await params; const sp = await searchParams;
  const { ctx, e, base } = await loadElection(cid, eid);
  const canPass = ctx.role === "super_admin" && e.effective === "open";
  const cfg = await getConfig();
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const page = Math.max(1, Number(sp.page) || 1);
  const d = await withCtx(ctx, async (tx) => ({
    total: (await tx`select count(*)::int as n from voters where election_id = ${eid}`)[0].n as number,
    groups: await tx`select coalesce(voter_group, '-') as g, count(*)::int as n from voters where election_id = ${eid} group by 1 order by 2 desc limit 20`,
    rows: await tx`select v.id, v.email, v.name, v.student_id, v.voter_group, v.created_at,
                    exists (select 1 from participations p where p.voter_id = v.id) as voted
                   from voters v where v.election_id = ${eid} and (${q} = '' or v.email like ${"%" + q + "%"} or lower(coalesce(v.name, '')) like ${"%" + q + "%"} or lower(coalesce(v.student_id, '')) like ${"%" + q + "%"})
                   order by v.email limit ${PAGE} offset ${(page - 1) * PAGE}`,
    imports: await tx`select id, filename, status, total_rows, accepted, rejected, duplicates, already_registered, error, created_at from voter_imports where election_id = ${eid} order by created_at desc limit 10`,
  }));
  const canImport = e.status === "draft" || e.status === "paused";
  const showVoted = !["draft", "scheduled"].includes(e.effective);
  return (
    <>
      {e.status === "draft" && <WizardSteps current="voters" base={base} done={{ details: true, voters: d.total > 0 }} />}
      {sp.created && <Notice tone="success" className="mb-5">Election created as a draft. Next, upload the list of eligible voters.</Notice>}
      {!canImport && <Notice tone="info" className="mb-5">The voter list is locked while the election is {e.effective}. {e.effective === "open" ? "Pause the election to add voters." : ""}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          {canImport && (
            <Card>
              <h2 className="text-lg font-semibold">Import eligible voters</h2>
              <p className="mt-1 mb-5 text-sm text-g600">Required columns: <strong>email</strong> and <strong>student ID</strong>. Students verify with both, so keep student IDs private. Emails and IDs must be unique. Re-importing adds new addresses and skips existing ones.</p>
              <VoterImport electionId={eid} previewAction={previewImportAction} commitAction={commitImportAction} maxMb={cfg.max_import_mb} />
            </Card>
          )}
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Voter list</h2><p className="text-sm text-g500">{d.total.toLocaleString("en-IN")} eligible voter{d.total === 1 ? "" : "s"} · private to administrators of this college</p></div>
              <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Search email, name or ID" aria-label="Search voters" className="h-10 w-56" /><button className="h-10 rounded-full border border-g300 px-4 text-sm hover:border-ink">Search</button></form>
            </div>
            {d.total === 0 ? <Empty title="No voters yet">Upload a spreadsheet or add students one at a time.</Empty> : (
              <>
                <Table caption="Eligible voters">
                  <thead><tr><th>Email</th><th>Name</th><th>Student ID</th><th>Group</th>{showVoted && <th>Participation</th>}{e.status === "draft" && <th><span className="sr-only">Remove</span></th>}</tr></thead>
                  <tbody>{d.rows.map((v) => (
                    <tr key={v.id}><td className="font-mono text-[0.8rem]">{v.email}</td><td>{v.name ?? "-"}</td><td>{v.student_id ?? "-"}</td><td>{v.voter_group ?? "-"}</td>
                      {showVoted && <td>{v.voted ? <Badge tone="completed">Voted</Badge> : canPass ? (
                        <Confirm triggerClass="text-xs underline hover:text-ink" trigger="Give voting access" title={`Give ${v.email} direct voting access?`} confirmLabel="Create voting link" tone="primary"
                          body={<p>Use this only when the student can't verify (for example a typo in the uploaded email or ID) and you've confirmed it's really them, e.g. by ID card. You get a single-use link. Valid 30 minutes, that opens their ballot directly. Send it only to this student. They can still vote only once per position.</p>}
                          action={issueVotingPassAction} hidden={{ election_id: eid, voter_id: v.id }} reasonLabel="How did you confirm it's this student?" />
                      ) : <span className="text-g500">-</span>}</td>}
                      {e.status === "draft" && <td><Confirm triggerClass="text-xs text-g500 underline hover:text-danger" trigger="Remove" title="Remove this voter?" confirmLabel="Remove" tone="danger" body={<p>{v.email} will no longer be eligible.</p>} action={removeVotersAction} hidden={{ election_id: eid, voter_id: v.id }} /></td>}
                    </tr>))}
                  </tbody>
                </Table>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-g500">Page {page} of {Math.max(1, Math.ceil(d.total / PAGE))}</span>
                  <span className="flex gap-2">
                    {page > 1 && <a className="underline" href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Previous</a>}
                    {d.rows.length === PAGE && <a className="underline" href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next →</a>}
                  </span>
                </div>
                {showVoted && <p className="mt-2 text-xs text-g500">“Voted” means the student submitted at least one position. How anyone voted is never shown.</p>}
              </>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {canImport && (
            <Card>
              <h2 className="font-semibold">Add one voter</h2>
              <ActionForm action={addVoterAction} resetOnSuccess className="mt-4 space-y-3">
                <input type="hidden" name="election_id" value={eid} />
                <Field label="Email" htmlFor="v-email"><Input id="v-email" name="email" type="email" required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" htmlFor="v-name" optional><Input id="v-name" name="name" maxLength={120} /></Field>
                  <Field label="Student ID" htmlFor="v-sid"><Input id="v-sid" name="student_id" maxLength={40} required /></Field>
                </div>
                <Field label="Group / department" htmlFor="v-group" optional><Input id="v-group" name="voter_group" maxLength={60} /></Field>
                <SubmitButton size="sm">Add voter</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {d.groups.length > 0 && <Card><h2 className="mb-3 font-semibold">Groups</h2><ul className="space-y-1.5 text-sm">{d.groups.map((g) => <li key={g.g} className="flex justify-between"><span>{g.g}</span><span className="tabular text-g500">{g.n}</span></li>)}</ul></Card>}
          <Card>
            <h2 className="mb-3 font-semibold">Import history</h2>
            {d.imports.length === 0 ? <p className="text-sm text-g500">No imports yet.</p> : (
              <ul className="divide-y divide-g100 text-sm">{d.imports.map((i) => (
                <li key={i.id} className="py-2.5">
                  <div className="flex justify-between gap-2"><span className="truncate font-medium">{i.filename}</span><Badge tone={i.status}>{i.status}</Badge></div>
                  <p className="text-xs text-g500">{fmtDate(i.created_at, e.timezone)}</p>
                  {i.status === "completed" ? <p className="text-xs text-g600">{i.accepted} added · {i.already_registered} already listed · {i.rejected} rejected ({i.duplicates} duplicates)
                    {i.rejected > 0 && <> · <a className="underline" href={`/api/exports/${eid}/import-errors?import=${i.id}`}>rejected rows</a></>}</p>
                    : <p className="text-xs text-danger">{i.error}</p>}
                </li>))}</ul>
            )}
          </Card>
          {e.status === "draft" && d.total > 0 && <Confirm triggerClass="text-sm text-g500 underline hover:text-danger" trigger="Remove all voters…" title="Remove the entire voter list?" tone="danger" confirmLabel="Remove all" body={<p>All {d.total} voters will be removed from this draft.</p>} action={removeVotersAction} hidden={{ election_id: eid, scope: "all" }} requireText="REMOVE ALL" />}
          {e.status === "draft" && <ButtonLink href={`${base}/positions`} variant="dark" className="w-full">Next: positions & candidates →</ButtonLink>}
        </div>
      </div>
    </>
  );
}
