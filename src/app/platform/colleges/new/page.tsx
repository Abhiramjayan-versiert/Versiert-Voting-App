import { requireSuperAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CollegeFields } from "@/components/college-form";
import { createCollegeAction } from "../../actions";

export const metadata = { title: "Add college" };
export default async function NewCollege() {
  await requireSuperAdmin();
  const cfg = await getConfig();
  return (
    <>
      <PageHeader dark eyebrow="Colleges" title="Add a college" />
      <div className="rounded-[var(--radius-card)] bg-paper p-5 text-ink sm:p-7">
        <ActionForm action={createCollegeAction}>
          <CollegeFields retention={cfg.allowed_retention_days} c={{ default_retention_days: cfg.default_retention_days }} />
          <div className="mt-7"><SubmitButton variant="dark" pendingText="Creating…">Create college</SubmitButton></div>
        </ActionForm>
      </div>
    </>
  );
}
