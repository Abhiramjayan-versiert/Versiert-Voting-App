import { SiteHeader, SiteFooter } from "@/components/site";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input } from "@/components/ui";
import { checkReceiptAction } from "../actions";

export const metadata = { title: "Check a confirmation code" };
export default function ReceiptCheck() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        <h1 className="text-[2.2rem] font-semibold leading-tight">Check a confirmation code</h1>
        <p className="mt-3 text-g600">Confirm that a ballot with your code was recorded. This never reveals what was chosen.</p>
        <ActionForm action={checkReceiptAction} className="mt-8 space-y-4">
          <label htmlFor="code" className="sr-only">Confirmation code</label>
          <Input id="code" name="code" required placeholder="VA-XXXX-XXXX-XXXX" className="h-13 font-mono text-lg uppercase tracking-wider" autoComplete="off" />
          <SubmitButton size="lg" className="w-full">Check code</SubmitButton>
        </ActionForm>
      </main>
      <SiteFooter />
    </>
  );
}
