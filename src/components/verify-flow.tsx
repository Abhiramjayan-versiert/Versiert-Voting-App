"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import type { Action, ActionState } from "./forms";
import { SubmitButton } from "./forms";
import { Notice } from "./ui";

export function VerifyFlow({ slug, requestAction, verifyAction, turnstileSiteKey, domains }: { slug: string; requestAction: Action; verifyAction: Action; turnstileSiteKey?: string; domains: string[] }) {
  const [req, sendReq] = useActionState(requestAction, null as ActionState);
  const [ver, sendVer] = useActionState(verifyAction, null as ActionState);
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (req?.ok) { setStage("code"); setTimeout(() => codeRef.current?.focus(), 50); } }, [req]);
  const needCaptcha = !!turnstileSiteKey && (req?.data as { captcha?: boolean } | undefined)?.captcha;

  if (stage === "email") return (
    <form action={sendReq} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">Official college email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={domains[0] ? `you@${domains[0]}` : "you@college.edu"} className="h-13 w-full rounded-2xl border border-g300 px-4 text-lg focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
        <p className="text-xs text-g500">Use the address your college registered for this election.</p>
      </div>
      {needCaptcha && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /><div className="cf-turnstile" data-sitekey={turnstileSiteKey} /></>}
      {req?.error && <Notice tone="error">{req.error}</Notice>}
      <SubmitButton variant="dark" size="lg" className="w-full" pendingText="Sending code…">Send verification code</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-4">
      <Notice tone="success">{req?.message}</Notice>
      <form action={sendVer} className="space-y-4">
        <input type="hidden" name="slug" value={slug} /><input type="hidden" name="email" value={email} />
        <div className="space-y-1.5">
          <label htmlFor="code" className="block text-sm font-medium">6-digit code sent to <span className="font-mono">{email}</span></label>
          <input ref={codeRef} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required
            className="h-14 w-full rounded-2xl border border-g300 px-4 text-center font-mono text-2xl tracking-[0.5em] focus:border-ink focus:outline-none focus:ring-2 focus:ring-lime/70" />
        </div>
        {ver?.error && <Notice tone="error">{ver.error}</Notice>}
        <SubmitButton variant="primary" size="lg" className="w-full" pendingText="Verifying…">Verify and open ballot</SubmitButton>
      </form>
      <div className="flex justify-between text-sm">
        <button type="button" className="underline" onClick={() => setStage("email")}>Use a different email</button>
        <form action={sendReq}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="email" value={email} /><button className="underline">Resend code</button></form>
      </div>
      <p className="text-xs text-g500">Codes expire after a few minutes. Didn't get one? Check spam, then confirm with your election administrator that your address is on the list.</p>
    </div>
  );
}
