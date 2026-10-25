import { notFound, redirect } from "next/navigation";
import { electionBySlug, getVoterSession } from "@/lib/voter";
import { VoterShell } from "@/components/voter-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { redeemPassAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open your ballot", robots: { index: false } };

/** Landing page for a Super Admin voting link. Redeemed only on a button press, so link previews can't use it up. */
export default async function Pass({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const e = await electionBySlug(slug);
  if (!e) notFound();
  if (e.effective !== "open") redirect(`/e/${slug}`);
  if (await getVoterSession(slug)) redirect(`/e/${slug}/ballot`);
  return (
    <VoterShell college={e.college_name} collegeId={e.college_id} hasLogo={e.has_logo} slug={slug}>
      <h1 className="mt-4 text-[2rem] font-semibold leading-tight">Your voting link</h1>
      <p className="mt-2 text-g600">The election administrator gave you direct access to vote in <strong>{e.title}</strong>. This link works once. Don't share it.</p>
      <ActionForm action={redeemPassAction} className="mt-6">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="token" value={token} />
        <SubmitButton variant="primary" size="lg" className="w-full" pendingText="Opening…">Open my ballot</SubmitButton>
      </ActionForm>
    </VoterShell>
  );
}
