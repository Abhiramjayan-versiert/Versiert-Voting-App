import { Field, Input, Select } from "./ui";

export function CollegeFields({ c, retention }: { c?: Record<string, any>; retention: number[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="College name" htmlFor="name"><Input id="name" name="name" required maxLength={160} defaultValue={c?.name} /></Field>
      <Field label="Unique college code" htmlFor="code" hint="Short ID to tell colleges apart, e.g. CET-TVM. Capital letters, numbers, dashes."><Input id="code" name="code" required maxLength={24} defaultValue={c?.code} className="uppercase font-mono" /></Field>
      <Field label="Short name" htmlFor="short_name" optional><Input id="short_name" name="short_name" maxLength={40} defaultValue={c?.short_name ?? ""} /></Field>
      <Field label="City" htmlFor="city" optional><Input id="city" name="city" maxLength={80} defaultValue={c?.city ?? ""} /></Field>
      <Field label="Default data retention" htmlFor="default_retention_days" hint="How long voter and ballot data is kept after results are published.">
        <Select id="default_retention_days" name="default_retention_days" defaultValue={String(c?.default_retention_days ?? 30)}>
          {retention.map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"} after publication</option>)}
        </Select>
      </Field>
    </div>
  );
}
