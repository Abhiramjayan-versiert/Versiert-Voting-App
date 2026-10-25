import { notFound } from "next/navigation";
import Link from "next/link";
import { withCtx, systemCtx } from "@/lib/db";
import { Logo, Badge, Stat, fmtDate } from "@/components/ui";
import { CopyButton, PrintButton } from "@/components/forms";
import { ResultsView } from "@/components/results-view";
import { CORRECTION_WINDOW_HOURS } from "@/lib/jobs";
import { env } from "@/lib/env";
import type { ElectionResult } from "@/lib/results";

export const dynamic = "force-dynamic";

async function load(ref: string) {
  if (!/^E-[0-9A-F]{10}$/.test(ref)) return null;
  const [row] = await withCtx(systemCtx, (tx) => tx`
    select e.status, e.published_at, e.timezone, e.college_id, c.name as college, (c.logo is not null) as has_logo, s.data, s.data_hash, s.created_at
      from elections e join colleges c on c.id = e.college_id
      join lateral (select data, data_hash, created_at from result_snapshots where election_id = e.id order by created_at desc limit 1) s on true
     where e.public_ref = ${ref} and e.status in ('published', 'retention', 'deleted')`);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = await load((await params).ref);
  return { title: r ? `Results — ${r.data.title}` : "Results", description: r ? `Published results for ${r.data.title} at ${r.college}.` : undefined };
}

export default async function PublicResults({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const row = await load(ref);
  if (!row) notFound();
  const d = row.data as { title: string; event_name: string; closed_at: string; generated_at: string; results: ElectionResult; integrity: { name: string; ok: boolean }[] };
  const final = row.status !== "published";
  const correctionEnds = new Date(new Date(row.published_at ?? row.created_at).getTime() + CORRECTION_WINDOW_HOURS * 3600_000);
  return (
    <div className="min-h-dvh">
      <header className="safe-top no-print border-b border-g100">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4"><Logo size={24} /><div className="flex gap-2"><CopyButton text={`${env().APP_URL}/r/${ref}`} /><PrintButton /></div></div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="flex items-center gap-3">
          {row.has_logo && <img src={`/media/logo/${row.college_id}`} alt="" className="size-10 rounded-lg object-contain" />}
          <p className="text-sm text-g600">{row.college}</p>
        </div>
        <p className="eyebrow mt-6 text-g500">{d.event_name}</p>
        <h1 className="mt-2 text-[2.2rem] font-semibold leading-[1.05] sm:text-[3rem]">{d.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={final ? "published" : "results_pending"}>{final ? "Final results" : "Published — correction window open"}</Badge>
          <span className="text-sm text-g500">Published {fmtDate(row.published_at ?? row.created_at, row.timezone)} · voting closed {fmtDate(d.closed_at, row.timezone)}</span>
        </div>
        {!final && <p className="mt-3 text-sm text-g600">These results become final on {fmtDate(correctionEnds, row.timezone)} unless the election administrators issue a correction.</p>}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Eligible voters" value={d.results.eligibleVoters.toLocaleString("en-IN")} />
          <Stat label="Votes cast" value={d.results.participatingVoters.toLocaleString("en-IN")} sub="students who voted" />
          <Stat accent label="Polling rate" value={`${d.results.turnoutPct.toFixed(1)}%`} />
          <Stat label="Positions" value={d.results.positions.length} />
        </div>
        <div className="mt-8"><ResultsView r={d.results} /></div>
        <section className="mt-10 rounded-2xl bg-g50 p-5 text-sm text-g600">
          <h2 className="font-semibold text-ink">About these results</h2>
          <p className="mt-2">Only accepted ballots are counted — at most one per eligible voter per position. Percentages are shares of valid candidate votes for each position; abstentions are reported separately. Who voted for whom is never recorded or shown. Ties are shown as ties; the college resolves them under its own rules.</p>
          <p className="mt-2">Integrity checks at publication: {d.integrity.every((i) => i.ok) ? "all passed" : "see administrators"}. Snapshot fingerprint <span className="break-all font-mono text-xs">{row.data_hash}</span>.</p>
          <p className="mt-2"><span className="font-medium text-ink">Verify your own vote:</span> enter the VC- verification code you received after voting at <Link href="/receipt" className="underline">/receipt</Link> to see exactly how your ballot was recorded.</p>
          <p className="mt-2"><Link href="/privacy" className="underline">How V.app protects voters</Link></p>
        </section>
      </main>
    </div>
  );
}
