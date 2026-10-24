import { notFound } from "next/navigation";
import { electionBySlug, getVoterSession } from "@/lib/voter";
import { VoterShell } from "@/components/voter-shell";
import { ButtonLink, Badge, Notice, fmtDate } from "@/components/ui";
import { maintenanceScreen } from "@/components/maintenance";
import { STATUS_LABEL } from "@/lib/lifecycle";
import { withCtx, systemCtx } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const e = await electionBySlug((await params).slug);
  return { title: e ? e.title : "Election", robots: { index: false } };
}

export default async function Entry({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const m = await maintenanceScreen(); if (m) return m;
  const { slug } = await params; const sp = await searchParams;
  const e = await electionBySlug(slug);
  if (!e) notFound();
  const session = await getVoterSession(slug);
  const st = e.effective as keyof typeof STATUS_LABEL;
  const [{ n: positions }] = await withCtx(systemCtx, (tx) => tx`select count(*)::int as n from positions where election_id = ${e.id}`);
  return (
    <VoterShell college={e.college_name} collegeId={e.college_id} hasLogo={e.has_logo} slug={slug}>
      {sp.signed_out && <Notice tone="info" className="mb-5">You've signed out of this voting session.</Notice>}
      {e.has_banner && <img src={`/media/banner/${e.id}`} alt="" className="mb-6 aspect-[3/1] w-full rounded-2xl object-cover" />}
      <p className="eyebrow text-g500">{e.event_name}</p>
      <h1 className="mt-2 text-[2.1rem] font-semibold leading-[1.05] sm:text-[2.6rem]">{e.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2"><Badge tone={st}>{st === "open" ? "Voting open" : STATUS_LABEL[st]}</Badge><span className="text-sm text-g500">{positions} position{positions === 1 ? "" : "s"} on the ballot</span></div>
      {e.description && <p className="mt-5 whitespace-pre-line text-g600">{e.description}</p>}
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-g200 p-4"><dt className="text-xs text-g500">Opens</dt><dd className="mt-1 text-sm font-medium">{fmtDate(e.starts_at, e.timezone)}</dd></div>
        <div className="rounded-2xl border border-g200 p-4"><dt className="text-xs text-g500">Closes</dt><dd className="mt-1 text-sm font-medium">{fmtDate(e.ends_at, e.timezone)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-g500">Times shown in {e.timezone}.</p>

      <div className="mt-8">
        {st === "open" ? (
          <ButtonLink href={session ? `/e/${slug}/ballot` : `/e/${slug}/verify`} variant="primary" size="lg" className="w-full sm:w-auto">{session ? "Continue voting" : "Start voting"}</ButtonLink>
        ) : st === "scheduled" ? <Notice tone="info" title="Voting hasn't started yet">Come back after {fmtDate(e.starts_at, e.timezone)}.</Notice>
          : st === "paused" ? <Notice tone="warning" title="Voting is temporarily paused">Your election administrator has paused voting. Votes already submitted are safe. Please check back soon.</Notice>
          : ["published", "retention"].includes(st) ? <ButtonLink href={`/r/${e.public_ref}`} variant="dark" size="lg">View published results</ButtonLink>
          : <Notice tone="info" title="Voting has closed">Results will be published by your election administrator.</Notice>}
      </div>

      <section className="mt-10 rounded-2xl bg-g50 p-5 sm:p-6" aria-labelledby="how">
        <h2 id="how" className="font-semibold">How it works</h2>
        <ol className="mt-3 space-y-2 text-sm text-g600 list-decimal pl-5">
          <li>Enter your official college email and your student ID. Both must match your college's voter list.</li>
          <li>Your ballot opens for a short session — keep the tab open until you submit.</li>
          <li>Choose a candidate for each position, review your choices, then submit. You may skip a position and come back later while voting is open.</li>
          <li>You can vote once per position. Submitted choices are final.</li>
        </ol>
      </section>
      <section className="mt-4 rounded-2xl border border-g200 p-5 sm:p-6" aria-labelledby="priv">
        <h2 id="priv" className="font-semibold">Your privacy</h2>
        {e.secret_ballot ? (
          <p className="mt-2 text-sm text-g600">This is a <strong className="text-ink">secret ballot</strong>. V.app records <em>that</em> you voted for a position separately from <em>what</em> you chose, with no link between them, so administrators can see turnout but not your choices. Your email is used only to confirm eligibility and is deleted after the retention period. <a href="/privacy" className="underline">How this works</a>.</p>
        ) : (
          <p className="mt-2 text-sm text-g600"><strong className="text-ink">This is an open ballot.</strong> Your college has configured this election so that each choice is linked to the voter and can be viewed by its election administrators. If you have concerns, contact your election administrator before voting.</p>
        )}
      </section>
    </VoterShell>
  );
}
