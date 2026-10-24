import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { electionBySlug, getVoterSession } from "@/lib/voter";
import { VoterShell } from "@/components/voter-shell";
import { VerifyFlow } from "@/components/verify-flow";
import { Notice } from "@/components/ui";
import { maintenanceScreen } from "@/components/maintenance";
import { isTestMode } from "@/lib/env";
import { verifyVoterAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify your email", robots: { index: false } };

export default async function Verify({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const m = await maintenanceScreen(); if (m) return m;
  const { slug } = await params; const sp = await searchParams;
  const e = await electionBySlug(slug);
  if (!e) notFound();
  if (e.effective !== "open") redirect(`/e/${slug}`);
  if (await getVoterSession(slug)) redirect(`/e/${slug}/ballot`);
  return (
    <VoterShell college={e.college_name} collegeId={e.college_id} hasLogo={e.has_logo} slug={slug}>
      <Link href={`/e/${slug}`} className="text-sm text-g500 hover:text-ink">← {e.title}</Link>
      <h1 className="mt-4 text-[2rem] font-semibold leading-tight">Verify it's you</h1>
      <p className="mt-2 text-g600">Enter the email your college registered for you and your student ID. Only students on the uploaded voter list can vote.</p>
      {sp.expired && <Notice tone="warning" className="mt-5">Your voting session expired. Verify again to continue — anything you already submitted is safe.</Notice>}
      {isTestMode() && <Notice tone="info" className="mt-5" title="Test mode">Try <span className="font-mono">student001@northfield.test</span> with student ID <span className="font-mono">T0001</span> (student002 → T0002, and so on).</Notice>}
      <div className="mt-6"><VerifyFlow slug={slug} verifyAction={verifyVoterAction} /></div>
    </VoterShell>
  );
}
