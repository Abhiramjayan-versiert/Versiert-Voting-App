import { SiteHeader, SiteFooter } from "@/components/site";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input } from "@/components/ui";
import { findElectionAction } from "../actions";

export const metadata = { title: "Find your election" };
export default function Vote() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        <p className="eyebrow text-g500">Students</p>
        <h1 className="mt-3 text-[2.4rem] font-semibold leading-tight">Find your election</h1>
        <p className="mt-3 text-g600">Paste the link your election administrator shared, or enter the election reference (it looks like <span className="font-mono">E-1A2B3C4D5E</span>).</p>
        <ActionForm action={findElectionAction} className="mt-8 space-y-4">
          <label htmlFor="q" className="sr-only">Election link or reference</label>
          <Input id="q" name="q" required placeholder="https://…/e/your-election or E-…" className="h-13 text-base" />
          <SubmitButton variant="primary" size="lg" className="w-full">Continue</SubmitButton>
        </ActionForm>
        <p className="mt-8 text-sm text-g500">No account needed. You'll verify with your college email and student ID.</p>
      </main>
      <SiteFooter />
    </>
  );
}
