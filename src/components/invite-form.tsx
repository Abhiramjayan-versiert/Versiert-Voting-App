import { ActionForm, SubmitButton } from "./forms";
import { Field, Input } from "./ui";
import { inviteAdminAction } from "@/app/platform/actions";

export function InviteAdminForm({ colleges, fixedCollegeId }: { colleges: { id: string; name: string }[]; fixedCollegeId?: string }) {
  return (
    <ActionForm action={inviteAdminAction} resetOnSuccess className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="inv-name"><Input id="inv-name" name="name" required maxLength={120} /></Field>
        <Field label="Account email" htmlFor="inv-email"><Input id="inv-email" name="email" type="email" required /></Field>
      </div>
      {fixedCollegeId ? <input type="hidden" name="college_ids" value={fixedCollegeId} /> : (
        <fieldset>
          <legend className="text-sm font-medium">Assign to colleges</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {colleges.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 rounded-lg border border-g200 px-3 py-2 text-sm has-[:checked]:border-ink">
                <input type="checkbox" name="college_ids" value={c.id} className="size-4 accent-ink" /> {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
    </ActionForm>
  );
}
