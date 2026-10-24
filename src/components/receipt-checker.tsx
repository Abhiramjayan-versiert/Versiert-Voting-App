"use client";
import { ActionForm, SubmitButton, type ActionState } from "./forms";
import { Input } from "./ui";

type Verified = { election: string; college: string; choices: { position: string; candidates: string[] }[] };

export function ReceiptChecker({ action }: { action: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  return (
    <ActionForm action={action} className="mt-8 space-y-4">
      {(state) => {
        const v = (state?.data as { verified?: Verified } | undefined)?.verified;
        return <>
          <label htmlFor="code" className="sr-only">Confirmation or verification code</label>
          <Input id="code" name="code" required placeholder="VA-XXXX-XXXX-XXXX or VC-XXXX-XXXX-XXXX" className="h-13 font-mono text-lg uppercase tracking-wider" autoComplete="off" />
          <SubmitButton size="lg" className="w-full">Check code</SubmitButton>
          {v && (
            <div className="rounded-2xl border border-g200 p-5" role="status">
              <p className="text-sm text-g600">{v.college}</p>
              <p className="font-semibold">{v.election}</p>
              <p className="mt-1 text-sm text-g600">The ballot recorded under this code:</p>
              <ul className="mt-3 divide-y divide-g100">
                {v.choices.map((c) => (
                  <li key={c.position} className="flex justify-between gap-4 py-2 text-sm"><span className="text-g600">{c.position}</span><span className="text-right font-medium">{c.candidates.join(", ")}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-g500">This is counted in the totals exactly as shown. V.app cannot tell who this ballot belongs to.</p>
            </div>
          )}
        </>;
      }}
    </ActionForm>
  );
}
