import Link from "next/link";
import { cx } from "./ui";

export const STEPS = [
  { key: "details", label: "Details", path: "details" },
  { key: "voters", label: "Voters", path: "voters" },
  { key: "positions", label: "Positions & candidates", path: "positions" },
  { key: "rules", label: "Voting rules", path: "rules" },
  { key: "review", label: "Review & open", path: "review" },
] as const;

export function WizardSteps({ current, base, done = {} }: { current: string; base?: string; done?: Record<string, boolean> }) {
  return (
    <nav aria-label="Election setup steps" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max gap-1.5">
        {STEPS.map((s, i) => {
          const active = s.key === current;
          const inner = (
            <span className={cx("flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
              active ? "border-ink bg-ink text-paper" : done[s.key] ? "border-g300 bg-paper hover:border-ink" : "border-g200 text-g500 hover:border-g400")}>
              <span className={cx("grid size-5 place-items-center rounded-full text-[0.7rem] font-semibold", active ? "bg-lime text-ink" : done[s.key] ? "bg-ink text-lime" : "bg-g100 text-g500")}>{done[s.key] && !active ? "✓" : i + 1}</span>
              {s.label}
            </span>
          );
          return <li key={s.key}>{base ? <Link href={`${base}/${s.path}`} aria-current={active ? "step" : undefined}>{inner}</Link> : inner}</li>;
        })}
      </ol>
    </nav>
  );
}
