import { notFound, redirect } from "next/navigation";
import { electionBySlug, getVoterSession, ballotFor } from "@/lib/voter";
import { VoterShell } from "@/components/voter-shell";
import { Ballot } from "@/components/ballot";
import { fmtDate } from "@/components/ui";
import { maintenanceScreen } from "@/components/maintenance";
import { voterSignOutAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your ballot", robots: { index: false } };

export default async function BallotPage({ params }: { params: Promise<{ slug: string }> }) {
  const m = await maintenanceScreen(); if (m) return m;
  const { slug } = await params;
  const e = await electionBySlug(slug);
  if (!e) notFound();
  if (e.effective !== "open") redirect(`/e/${slug}`);
  const s = await getVoterSession(slug);
  if (!s) redirect(`/e/${slug}/verify`);
  const b = await ballotFor(e.id, s.voter_id, s.voter_group);
  return (
    <VoterShell college={e.college_name} collegeId={e.college_id} hasLogo={e.has_logo} slug={slug}>
      <div className="flex items-center justify-between gap-3 text-xs text-g500">
        <span>Signed in as <span className="font-mono text-ink">{s.email}</span></span>
        <form action={voterSignOutAction}><input type="hidden" name="slug" value={slug} /><button className="underline">Sign out</button></form>
      </div>
      {b.positions.length === 0 ? <p className="mt-8 text-g600">There are no positions on this ballot that you're eligible to vote for. Contact your election administrator if this looks wrong.</p> : (
        <Ballot slug={slug} title={e.title} closesLabel={fmtDate(e.ends_at, e.timezone)} allowAbstain={e.allow_abstain} requireAll={e.require_all_positions}
          positions={b.positions as never} candidates={b.candidates as never} />
      )}
    </VoterShell>
  );
}
