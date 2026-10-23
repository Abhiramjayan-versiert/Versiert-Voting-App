import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { isTestMode } from "@/lib/env";
import { normalizeEmail } from "@/lib/email-normalize";
import { Logo, Input, fmtDate, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test inbox", robots: { index: false } };

/** TEST MODE ONLY: lets testers read the one-time codes sent to fictional student addresses. Returns 404 in production. */
export default async function DevInbox({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (!isTestMode()) notFound();
  const email = normalizeEmail((await searchParams).email ?? "");
  const mails = email ? await sql()`select * from dev_mailbox where to_email = ${email} and to_email like '%.test' order by created_at desc limit 10` : [];
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">Test inbox</h1>
      <Notice tone="warning" className="mt-4" title="Test mode only">This page exists only when APP_MODE=test and only shows mail for fictional <span className="font-mono">.test</span> addresses. It is unavailable in production.</Notice>
      <form className="mt-6 flex gap-2"><Input name="email" defaultValue={email ?? ""} placeholder="student001@northfield.test" aria-label="Test email address" /><button className="h-11 rounded-full bg-ink px-5 text-sm font-medium text-paper">Open</button></form>
      <div className="mt-6 space-y-3">
        {email && mails.length === 0 && <p className="text-sm text-g500">No messages for {email}. Request a code first.</p>}
        {mails.map((m) => (
          <article key={m.id} className="rounded-2xl border border-g200 p-4">
            <p className="text-xs text-g500">{fmtDate(m.created_at)}</p>
            <h2 className="mt-1 font-semibold">{m.subject}</h2>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-g600">{m.body_text}</pre>
          </article>
        ))}
      </div>
    </main>
  );
}
