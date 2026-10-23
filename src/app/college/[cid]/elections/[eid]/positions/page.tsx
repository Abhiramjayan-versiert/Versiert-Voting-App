import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { Card, Notice, Field, Input, Textarea, Badge, Empty, ButtonLink, Select } from "@/components/ui";
import { ActionForm, SubmitButton, Confirm } from "@/components/forms";
import { WizardSteps } from "@/components/wizard";
import { Avatar } from "@/components/candidate-avatar";
import { upsertPositionAction, deletePositionAction, movePositionAction, upsertCandidateAction, deleteCandidateAction, candidateStatusAction } from "@/app/college/actions";

export const metadata = { title: "Positions & candidates" };

function PositionForm({ eid, p }: { eid: string; p?: Record<string, any> }) {
  return (
    <ActionForm action={upsertPositionAction} resetOnSuccess={!p} className="space-y-3">
      <input type="hidden" name="election_id" value={eid} />{p && <input type="hidden" name="position_id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field label="Position name" htmlFor={`pn-${p?.id ?? "new"}`}><Input id={`pn-${p?.id ?? "new"}`} name="name" required maxLength={120} defaultValue={p?.name} placeholder="e.g. Chairperson" /></Field>
        <Field label="Choices per voter" htmlFor={`ms-${p?.id ?? "new"}`}><Input id={`ms-${p?.id ?? "new"}`} name="max_selections" type="number" min={1} max={20} defaultValue={p?.max_selections ?? 1} /></Field>
      </div>
      <Field label="Only these voter groups may vote" htmlFor={`eg-${p?.id ?? "new"}`} optional hint="Comma-separated groups from the voter list (e.g. CSE, ECE). Leave blank so every eligible voter can vote for this position.">
        <Input id={`eg-${p?.id ?? "new"}`} name="eligible_groups" defaultValue={(p?.eligible_groups ?? []).join(", ")} />
      </Field>
      <Field label="Description" htmlFor={`pd-${p?.id ?? "new"}`} optional><Input id={`pd-${p?.id ?? "new"}`} name="description" maxLength={1000} defaultValue={p?.description ?? ""} /></Field>
      <SubmitButton size="sm">{p ? "Save position" : "Add position"}</SubmitButton>
    </ActionForm>
  );
}

function CandidateForm({ eid, pid, c, photos }: { eid: string; pid: string; c?: Record<string, any>; photos: boolean }) {
  const k = c?.id ?? `new-${pid}`;
  return (
    <ActionForm action={upsertCandidateAction} resetOnSuccess={!c} className="space-y-3">
      <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="position_id" value={pid} />{c && <input type="hidden" name="candidate_id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" htmlFor={`cn-${k}`}><Input id={`cn-${k}`} name="full_name" required maxLength={120} defaultValue={c?.full_name} /></Field>
        <Field label="Student ID" htmlFor={`cs-${k}`} optional hint="Checked against the voter list when one exists."><Input id={`cs-${k}`} name="student_id" maxLength={40} defaultValue={c?.student_id ?? ""} /></Field>
        <Field label="Department / class" htmlFor={`cd-${k}`} optional><Input id={`cd-${k}`} name="department" maxLength={120} defaultValue={c?.department ?? ""} /></Field>
        <Field label="Year" htmlFor={`cy-${k}`} optional><Input id={`cy-${k}`} name="year_label" maxLength={40} defaultValue={c?.year_label ?? ""} /></Field>
        <Field label="Symbol" htmlFor={`sy-${k}`} optional><Input id={`sy-${k}`} name="symbol" maxLength={40} defaultValue={c?.symbol ?? ""} placeholder="e.g. Star" /></Field>
        {photos && <div className="space-y-1.5"><label htmlFor={`ph-${k}`} className="text-sm font-medium">Photograph <span className="font-normal text-g500">(optional · ≤ 600 KB)</span></label>
          <input id={`ph-${k}`} name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-g100 file:px-3 file:py-1.5" />
          {c?.has_photo && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="remove_photo" className="accent-ink" /> Remove current photo</label>}</div>}
      </div>
      <Field label="Short introduction" htmlFor={`ci-${k}`} optional hint="Up to 500 characters, shown on the ballot."><Textarea id={`ci-${k}`} name="intro" maxLength={500} rows={2} defaultValue={c?.intro ?? ""} /></Field>
      <Field label="Manifesto / campaign statement" htmlFor={`cm-${k}`} optional hint="Up to 5,000 characters. Voters can expand it from the ballot."><Textarea id={`cm-${k}`} name="manifesto" maxLength={5000} rows={4} defaultValue={c?.manifesto ?? ""} /></Field>
      <SubmitButton size="sm">{c ? "Save candidate" : "Add candidate"}</SubmitButton>
    </ActionForm>
  );
}

export default async function Positions({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e, base } = await loadElection(cid, eid);
  const cfg = await getConfig();
  const d = await withCtx(ctx, async (tx) => ({
    positions: await tx`select * from positions where election_id = ${eid} order by sort_order, name`,
    candidates: await tx`select id, position_id, full_name, department, year_label, student_id, intro, manifesto, symbol, status, (photo is not null) as has_photo from candidates where election_id = ${eid} order by sort_order, full_name`,
    groups: await tx`select distinct voter_group as g from voters where election_id = ${eid} and voter_group is not null order by 1 limit 30`,
  }));
  const draft = e.status === "draft", paused = e.status === "paused";
  const H = { election_id: eid };
  return (
    <>
      {draft && <WizardSteps current="positions" base={base} done={{ details: true, voters: true, positions: d.positions.length > 0 }} />}
      {!draft && <Notice tone="info" className="mb-5">Positions and candidates are locked once the election is activated. {paused ? "While paused you may withdraw or disqualify a candidate; votes already cast for them are kept and reported." : e.effective === "open" ? "To change a candidate's status, pause the election first." : ""}</Notice>}
      {d.groups.length > 0 && draft && <p className="mb-4 text-sm text-g600">Voter groups in your list: {d.groups.map((g) => <Badge key={g.g} tone="info" className="mr-1">{g.g}</Badge>)}</p>}
      <div className="space-y-5">
        {d.positions.length === 0 && <Empty title="No positions yet">Add positions such as Chairperson, General Secretary or Treasurer. Each voter may vote once per position.</Empty>}
        {d.positions.map((p, idx) => {
          const cands = d.candidates.filter((c) => c.position_id === p.id);
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-g500">Position {idx + 1}</p>
                  <h2 className="mt-1 text-xl font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm text-g500">{p.max_selections === 1 ? "One choice per voter" : `Up to ${p.max_selections} choices per voter`} · {p.eligible_groups?.length ? `Groups: ${p.eligible_groups.join(", ")}` : "All eligible voters"}{p.description ? ` · ${p.description}` : ""}</p>
                </div>
                {draft && (
                  <div className="flex items-center gap-1">
                    {idx > 0 && <ActionForm action={movePositionAction}><input type="hidden" name="election_id" value={eid} /><input type="hidden" name="position_id" value={p.id} /><input type="hidden" name="dir" value="up" /><SubmitButton variant="ghost" size="sm"><span aria-label="Move up">↑</span></SubmitButton></ActionForm>}
                    {idx < d.positions.length - 1 && <ActionForm action={movePositionAction}><input type="hidden" name="election_id" value={eid} /><input type="hidden" name="position_id" value={p.id} /><input type="hidden" name="dir" value="down" /><SubmitButton variant="ghost" size="sm"><span aria-label="Move down">↓</span></SubmitButton></ActionForm>}
                    <Confirm triggerClass="ml-1 text-sm text-g500 underline hover:text-danger" trigger="Remove" title={`Remove “${p.name}”?`} tone="danger" confirmLabel="Remove position" body={<p>Its {cands.length} candidate(s) are removed too.</p>} action={deletePositionAction} hidden={{ ...H, position_id: p.id }} />
                  </div>
                )}
              </div>
              {draft && <details className="mt-3 rounded-xl border border-g200 p-4"><summary className="cursor-pointer text-sm font-medium">Edit position</summary><div className="mt-4"><PositionForm eid={eid} p={p} /></div></details>}
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {cands.map((c) => (
                  <li key={c.id} className="rounded-xl border border-g200 p-4">
                    <div className="flex gap-3">
                      <Avatar id={c.id} name={c.full_name} hasPhoto={c.has_photo} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.full_name} {c.status !== "active" && <Badge tone={c.status}>{c.status}</Badge>}</p>
                        <p className="text-xs text-g500">{[c.department, c.year_label, c.student_id && `ID ${c.student_id}`, c.symbol && `Symbol: ${c.symbol}`].filter(Boolean).join(" · ")}</p>
                        {c.intro && <p className="mt-1.5 text-sm text-g600">{c.intro}</p>}
                      </div>
                    </div>
                    {draft && <>
                      <details className="mt-3"><summary className="cursor-pointer text-sm text-g600 underline">Edit</summary><div className="mt-3"><CandidateForm eid={eid} pid={p.id} c={c} photos={cfg.feature_candidate_photos} /></div></details>
                      <Confirm triggerClass="mt-2 text-xs text-g500 underline hover:text-danger" trigger="Remove candidate" title={`Remove ${c.full_name}?`} tone="danger" confirmLabel="Remove" body={<p>This draft candidate will be deleted.</p>} action={deleteCandidateAction} hidden={{ ...H, candidate_id: c.id }} />
                    </>}
                    {paused && (
                      <details className="mt-3"><summary className="cursor-pointer text-sm text-g600 underline">Change status (amendment)</summary>
                        <ActionForm action={candidateStatusAction} className="mt-3 space-y-2">
                          <input type="hidden" name="election_id" value={eid} /><input type="hidden" name="candidate_id" value={c.id} />
                          <Select name="status" defaultValue={c.status} aria-label="Candidate status"><option value="active">Active</option><option value="withdrawn">Withdrawn</option><option value="disqualified">Disqualified</option></Select>
                          <Textarea name="reason" required minLength={10} placeholder="Reason (audit-logged)" rows={2} />
                          <SubmitButton size="sm" variant="danger">Apply amendment</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {cands.length === 0 && <p className="mt-3 text-sm text-g500">No candidates yet.</p>}
              {draft && <details className="mt-4 rounded-xl border border-dashed border-g300 p-4" open={cands.length === 0}><summary className="cursor-pointer text-sm font-medium">+ Add a candidate for {p.name}</summary><div className="mt-4"><CandidateForm eid={eid} pid={p.id} photos={cfg.feature_candidate_photos} /></div></details>}
            </Card>
          );
        })}
        {draft && <Card><h2 className="mb-4 font-semibold">Add a position</h2><PositionForm eid={eid} /></Card>}
        {draft && d.positions.length > 0 && <div className="flex flex-wrap justify-end gap-2"><ButtonLink href={`${base}/preview`} variant="outline">Preview ballot</ButtonLink><ButtonLink href={`${base}/rules`}>Next: voting rules →</ButtonLink></div>}
      </div>
    </>
  );
}
