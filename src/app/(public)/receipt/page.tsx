import { SiteHeader, SiteFooter } from "@/components/site";
import { ReceiptChecker } from "@/components/receipt-checker";
import { checkReceiptAction } from "../actions";

export const metadata = { title: "Check or verify your vote" };
export default function ReceiptCheck() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-16 sm:py-24">
        <h1 className="text-[2.2rem] font-semibold leading-tight">Check or verify your vote</h1>
        <p className="mt-3 text-g600">A confirmation code (VA-…) shows that your ballot was recorded. A verification code (VC-…) also shows exactly how it was recorded, so you can check your vote was counted as you cast it. Nobody, including the election administrators, can tell who a code belongs to.</p>
        <ReceiptChecker action={checkReceiptAction} />
      </main>
      <SiteFooter />
    </>
  );
}
