import { requireCollegeAdmin } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DetailsFields } from "@/components/election-fields";
import { WizardSteps } from "@/components/wizard";
import { createElectionAction } from "@/app/college/actions";

export const metadata = { title: "New election" };
export default async function NewElection({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  await requireCollegeAdmin(cid);
  return (
    <>
      <PageHeader eyebrow="New election · Step 1 of 6" title="Event details" description="You can change everything until you activate the election." />
      <WizardSteps current="details" />
      <Card>
        <ActionForm action={createElectionAction}>
          <input type="hidden" name="college_id" value={cid} />
          <DetailsFields />
          <div className="mt-7 flex justify-end"><SubmitButton variant="dark" pendingText="Creating…">Save and continue →</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
