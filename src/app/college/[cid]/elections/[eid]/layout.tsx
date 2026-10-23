import Link from "next/link";
import { loadElection } from "@/lib/election-page";
import { Badge, fmtDate } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/lifecycle";
import { ElectionTabs } from "@/components/election-tabs";

export default async function ElectionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { e, base } = await loadElection(cid, eid);
  const st = e.effective as keyof typeof STATUS_LABEL;
  return (
    <>
      <div className="mb-5">
        <Link href={`/college/${cid}/elections`} className="text-sm text-g500 hover:text-ink">← Elections</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[1.6rem] font-semibold leading-tight sm:text-[2rem]">{e.title}</h1>
          <Badge tone={st}>{STATUS_LABEL[st]}</Badge>
          {!e.secret_ballot && <Badge tone="warning">Open ballot</Badge>}
        </div>
        <p className="mt-1 text-sm text-g500">{e.event_name} · {fmtDate(e.starts_at, e.timezone)} → {fmtDate(e.ends_at, e.timezone)} ({e.timezone}) · Ref <span className="font-mono">{e.public_ref}</span></p>
      </div>
      <ElectionTabs base={base} status={st} />
      {children}
    </>
  );
}
