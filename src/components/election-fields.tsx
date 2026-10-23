import { Field, Input, Select, Textarea } from "./ui";
import { utcToZonedInput } from "@/lib/action-utils";

export const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

export function DetailsFields({ e, disabled }: { e?: Record<string, any>; disabled?: boolean }) {
  const tz = e?.timezone ?? "Asia/Kolkata";
  const start = e?.starts_at ?? new Date(Date.now() + 86_400_000);
  const end = e?.ends_at ?? new Date(Date.now() + 86_400_000 + 8 * 3600_000);
  return (
    <fieldset disabled={disabled} className="grid gap-5 sm:grid-cols-2">
      <Field label="Event name" htmlFor="event_name" hint="e.g. College Union Election 2026"><Input id="event_name" name="event_name" required maxLength={160} defaultValue={e?.event_name} /></Field>
      <Field label="Election title" htmlFor="title" hint="Shown to voters at the top of the ballot."><Input id="title" name="title" required maxLength={160} defaultValue={e?.title} /></Field>
      <div className="sm:col-span-2"><Field label="Description" htmlFor="description" optional hint="Instructions or context for voters."><Textarea id="description" name="description" maxLength={4000} rows={3} defaultValue={e?.description ?? ""} /></Field></div>
      <Field label="Academic year" htmlFor="academic_year" optional><Input id="academic_year" name="academic_year" maxLength={20} placeholder="2026–27" defaultValue={e?.academic_year ?? ""} /></Field>
      <Field label="Department or unit" htmlFor="department" optional hint="Leave blank for a college-wide election."><Input id="department" name="department" maxLength={120} defaultValue={e?.department ?? ""} /></Field>
      <Field label="Voting opens" htmlFor="starts_at"><Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={utcToZonedInput(start, tz)} /></Field>
      <Field label="Voting closes" htmlFor="ends_at"><Input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={utcToZonedInput(end, tz)} /></Field>
      <Field label="Election timezone" htmlFor="timezone" hint="Opening and closing times are in this timezone."><Select id="timezone" name="timezone" defaultValue={tz}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
    </fieldset>
  );
}
