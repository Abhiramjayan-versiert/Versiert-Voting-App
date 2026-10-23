import { notFound } from "next/navigation";
import { electionBySlug, getVoterSession, ballotFor } from "@/lib/voter";
import { VoterShell } from "@/components/voter-shell";
import { Receipt } from "@/components/receipt";
import { ButtonLink } from "@/components/ui";
import { voterSignOutAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ballot submitted", robots: { index: false } };

export default async function Done({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await electionBySlug(slug);
  if (!e) notFound();
  const s = await getVoterSession(slug);
  const remaining = s && e.effective === "open" ? (await ballotFor(e.id, s.voter_id, s.voter_group)).positions.filter((p) => !p.voted).length : 0;
  return (
    <VoterShell college={e.college_name} collegeId={e.college_id} hasLogo={e.has_logo} slug={slug}>
      <div className="py-6 text-center animate-in">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-lime">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden><path d="M7 14.5 12 19.5 21.5 9" stroke="#080808" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="mt-6 text-[2rem] font-semibold leading-tight">Your ballot has been submitted successfully.</h1>
        <p className="mt-3 text-g600">Thank you for voting in {e.title}. Every valid vote counts.</p>
        <Receipt slug={slug} />
        {remaining > 0 && (
          <div className="mt-8 rounded-2xl border border-g200 p-5 text-left">
            <p className="font-medium">{remaining} position{remaining === 1 ? "" : "s"} still open to you</p>
            <p className="mt-1 text-sm text-g600">You skipped {remaining === 1 ? "a position" : "some positions"}. You can vote for {remaining === 1 ? "it" : "them"} any time before voting closes.</p>
            <ButtonLink href={`/e/${slug}/ballot`} variant="dark" className="mt-4">Continue voting</ButtonLink>
          </div>
        )}
        <form action={voterSignOutAction} className="mt-8"><input type="hidden" name="slug" value={slug} /><button className="text-sm underline">Sign out of this device</button></form>
      </div>
    </VoterShell>
  );
}
