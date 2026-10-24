"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type Action } from "./forms";

export function VerifyFlow({ slug, verifyAction, domains }: { slug: string; verifyAction: Action; domains: string[] }) {
  const [email, setEmail] = useState("");
  return (
    <ActionForm action={verifyAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">Official college email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={domains[0] ? `you@${domains[0]}` : "you@college.edu"} className="h-13 w-full rounded-2xl border border-g300 px-4 text-lg focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="student_id" className="block text-sm font-medium">Student ID / roll number</label>
        <input id="student_id" name="student_id" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={40}
          className="h-13 w-full rounded-2xl border border-g300 px-4 font-mono text-lg uppercase tracking-wider focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
        <p className="text-xs text-g500">Exactly as it appears on your college records. Spaces and capital letters don't matter.</p>
      </div>
      <SubmitButton variant="primary" size="lg" className="w-full" pendingText="Checking…">Verify and open ballot</SubmitButton>
    </ActionForm>
  );
}
