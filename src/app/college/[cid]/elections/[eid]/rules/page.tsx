import { loadElection } from "@/lib/election-page";
import { getConfig } from "@/lib/config";
import { emailEnabled } from "@/lib/env";
import { Card, Notice, Check, Field, Select, ButtonLink } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { WizardSteps } from "@/components/wizard";
import { updateRulesAction } from "@/app/college/actions";

export const metadata = { title: "Voting rules" };
export default async function Rules({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { e, base } = await loadElection(cid, eid);
  const cfg = await getConfig();
  const locked = e.status !== "draft";
  const emailOn = emailEnabled();
  return (
    <>
      {!locked && <WizardSteps current="rules" base={base} done={{ details: true, voters: true, positions: true }} />}
      {locked && <Notice tone="info" className="mb-5">Voting rules are fixed once the election is activated.</Notice>}
      <Card>
        <ActionForm action={updateRulesAction}>
          <input type="hidden" name="election_id" value={eid} />
          <fieldset disabled={locked} className="space-y-8">
            <section>
              <h2 className="font-semibold">Ballot</h2>
              <p className="mt-1 text-sm text-g600">Every eligible voter may vote once per position. Position-specific eligibility is set on each position.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex gap-3 rounded-xl border border-g200 p-4 has-[:checked]:border-ink has-[:checked]:bg-g50">
                  <input type="radio" name="ballot_type" value="secret" defaultChecked={e.secret_ballot} className="mt-1 accent-ink" />
                  <span><span className="block text-sm font-medium">Secret ballot (recommended)</span><span className="text-[0.82rem] text-g500">Choices are stored with no link to the voter. Nobody, including administrators, can see how a student voted.</span></span>
                </label>
                <label className={`flex gap-3 rounded-xl border border-g200 p-4 has-[:checked]:border-ink has-[:checked]:bg-g50 ${cfg.feature_open_ballot ? "" : "opacity-50"}`}>
                  <input type="radio" name="ballot_type" value="open" defaultChecked={!e.secret_ballot} disabled={!cfg.feature_open_ballot} className="mt-1 accent-ink" />
                  <span><span className="block text-sm font-medium">Open ballot</span><span className="text-[0.82rem] text-g500">Each choice is linked to the voter and exportable by administrators. Voters are told this before voting. Use only where your rules require it.</span></span>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Check name="allow_abstain" label="Allow abstention" description="Voters can record “abstain” for a position. Counted separately; never a candidate vote." defaultChecked={e.allow_abstain} />
                <Check name="require_email_code" label="Email a 6-digit code to confirm each voter" description={emailOn ? "Recommended. After email + student ID match, the student must enter a code sent to that email. Someone who only knows a classmate's email and roll number can't vote." : "Email isn't set up on this platform yet, so this has no effect until the Super Admin adds a Gmail sender."} defaultChecked={e.require_email_code !== false} />
                <Check name="require_all_positions" label="Require every position" description="Off (default): students may vote for some positions now and others later, or skip positions." defaultChecked={e.require_all_positions} />
              </div>
            </section>
            <section>
              <h2 className="font-semibold">Results</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Check name="admin_live_results" label="Show live tallies to administrators while voting is open" description="Students and the public never see totals before publication. With very few voters, live tallies can hint at individual choices." defaultChecked={e.admin_live_results} />
                <Check name="results_require_approval" label="Results require administrator approval" description="Off: results publish automatically at closing if every integrity check passes." defaultChecked={e.results_require_approval} />
                <Check name="allow_unpublish" label="Allow unpublishing during the 24-hour correction window" defaultChecked={e.allow_unpublish} />
              </div>
            </section>
            <section>
              <h2 className="font-semibold">Data retention</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Delete voter and ballot data" htmlFor="retention_days" hint="Counted from publication. The college default is preselected.">
                  <Select id="retention_days" name="retention_days" defaultValue={String(e.retention_days)}>{cfg.allowed_retention_days.map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"} after results are published</option>)}</Select>
                </Field>
                <Check name="keep_public_results" label="Keep the aggregate results page after deletion" description="Only totals per candidate remain. Voter emails, participation records and ballots are deleted." defaultChecked={e.keep_public_results} />
              </div>
            </section>
          </fieldset>
          {!locked && <div className="mt-8 flex flex-wrap justify-between gap-3"><SubmitButton pendingText="Saving…">Save rules</SubmitButton><ButtonLink href={`${base}/review`} variant="outline">Next: review & open →</ButtonLink></div>}
        </ActionForm>
      </Card>
    </>
  );
}
