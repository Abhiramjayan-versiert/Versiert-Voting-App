"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type Action, type ActionState } from "./forms";

const field = "h-13 w-full rounded-2xl border border-g300 px-4 text-lg focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70";

export function VerifyFlow({ slug, verifyAction, codeAction }: { slug: string; verifyAction: Action; codeAction: Action }) {
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [stage, setStage] = useState<"details" | "code">("details");
  const [sentMsg, setSentMsg] = useState("");

  if (stage === "code") {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-g50 px-4 py-3 text-sm text-g600" role="status">{sentMsg} Check your spam folder if it isn't in your inbox.</p>
        <ActionForm action={codeAction} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="email" value={email} />
          <div className="space-y-1.5">
            <label htmlFor="code" className="block text-sm font-medium">6-digit code from the email</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required autoFocus
              className={`${field} text-center font-mono text-2xl tracking-[0.4em]`} />
          </div>
          <SubmitButton variant="primary" size="lg" className="w-full" pendingText="Checking…">Verify and open ballot</SubmitButton>
        </ActionForm>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <ActionForm action={verifyAction} onSuccess={(s: ActionState) => s?.message && setSentMsg(s.message)}>
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="email" value={email} /><input type="hidden" name="student_id" value={studentId} />
            <button type="submit" className="underline">Send a new code</button>
          </ActionForm>
          <button type="button" className="underline" onClick={() => setStage("details")}>Use a different email</button>
        </div>
      </div>
    );
  }

  return (
    <ActionForm action={verifyAction} className="space-y-4"
      onSuccess={(s: ActionState) => { if ((s?.data as { codeSent?: boolean } | undefined)?.codeSent) { setSentMsg(s?.message ?? ""); setStage("code"); } }}>
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">Your email address</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="The email your college registered for you" className={field} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="student_id" className="block text-sm font-medium">Student ID / roll number</label>
        <input id="student_id" name="student_id" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={40} value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className={`${field} font-mono uppercase tracking-wider`} />
        <p className="text-xs text-g500">Exactly as it appears on your college records. Spaces and capital letters don't matter.</p>
      </div>
      <SubmitButton variant="primary" size="lg" className="w-full" pendingText="Checking…">Continue</SubmitButton>
    </ActionForm>
  );
}
