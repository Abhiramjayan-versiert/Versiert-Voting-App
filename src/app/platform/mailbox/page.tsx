import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isTestMode } from "@/lib/env";
import { PageHeader, Card, fmtDate, Empty } from "@/components/ui";

export const metadata = { title: "Test mailbox" };
export default async function Mailbox() {
  if (!isTestMode()) notFound();
  await requireSuperAdmin();
  const mails = await sql()`select * from dev_mailbox order by created_at desc limit 50`;
  return (
    <>
      <PageHeader dark eyebrow="Test mode only" title="Test mailbox" description="In test mode no real email is sent. Messages land here instead. This page does not exist in production." />
      {mails.length === 0 ? <Empty dark title="No messages yet" /> : (
        <div className="space-y-3">{mails.map((m) => (
          <Card dark key={m.id}>
            <p className="text-xs text-g500">{fmtDate(m.created_at)} · to <span className="text-g300">{m.to_email}</span></p>
            <p className="mt-1 font-semibold">{m.subject}</p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-g300">{m.body_text}</pre>
          </Card>))}
        </div>
      )}
    </>
  );
}
