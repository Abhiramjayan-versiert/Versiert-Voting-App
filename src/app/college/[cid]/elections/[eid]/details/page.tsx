import { loadElection } from "@/lib/election-page";
import { Card, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DetailsFields } from "@/components/election-fields";
import { WizardSteps } from "@/components/wizard";
import { updateDetailsAction } from "@/app/college/actions";

export const metadata = { title: "Event details" };
export default async function Details({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { e, base } = await loadElection(cid, eid);
  const locked = e.status !== "draft";
  return (
    <>
      <WizardSteps current="details" base={base} done={{ details: true }} />
      {locked && <Notice tone="info" className="mb-5">The election has been activated, so its details are locked. {e.effective === "scheduled" ? "Return it to draft from the overview to edit." : ""}</Notice>}
      <Card>
        <ActionForm action={updateDetailsAction}>
          <input type="hidden" name="election_id" value={eid} />
          <DetailsFields e={e} disabled={locked} />
          {!locked && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:items-end">
              <div className="space-y-1.5"><label htmlFor="banner" className="text-sm font-medium">Event banner <span className="font-normal text-g500">(optional · JPEG/PNG/WebP ≤ 800 KB · wide image)</span></label>
                <input id="banner" name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-g100 file:px-4 file:py-2" /></div>
              {e.has_banner && <label className="flex items-center gap-3 text-sm"><img src={`/media/banner/${eid}`} alt="" className="h-12 w-28 rounded-lg border border-g200 object-cover" /><input type="checkbox" name="remove_banner" className="accent-ink" /> Remove banner</label>}
            </div>
          )}
          {!locked && <div className="mt-7 flex flex-wrap justify-between gap-3"><SubmitButton pendingText="Saving…">Save details</SubmitButton><a href={`${base}/voters`} className="inline-flex h-11 items-center rounded-full border border-g300 px-5 text-sm font-medium hover:border-ink">Next: voters →</a></div>}
        </ActionForm>
      </Card>
    </>
  );
}
