import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, Badge, fmtDate, Empty, Card } from "@/components/ui";
import { Confirm } from "@/components/forms";
import { resolveIncidentAction, revokeAllMySessionsAction } from "../actions";

export const metadata = { title: "Security events" };
export default async function Security({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { ctx } = await requireSuperAdmin();
  const show = sp.show === "all" ? "all" : "open";
  const rows = await withCtx(ctx, (tx) => tx`
    select s.*, c.name as college, e.title as election from security_events s
      left join colleges c on c.id = s.college_id left join elections e on e.id = s.election_id
     where ${show === "all"} or s.resolved_at is null order by s.at desc limit 200`);
  return (
    <>
      <PageHeader dark eyebrow="Oversight" title="Security events" description="Rate-limit trips, lockouts, duplicate-vote attempts, pauses and integrity flags. IP addresses are stored only as keyed hashes."
        actions={<>
          <a href={show === "all" ? "?show=open" : "?show=all"} className="inline-flex h-9 items-center rounded-full border border-g600 px-4 text-sm hover:border-lime">{show === "all" ? "Unresolved only" : "Show all"}</a>
          <Confirm triggerClass="inline-flex h-9 items-center rounded-full border border-g600 px-4 text-sm hover:border-[#ffd27a]" trigger="Sign out all my sessions" title="Sign out every Super Admin session?" tone="danger" confirmLabel="Sign out everywhere"
            body={<p>Use this if you suspect your account is compromised. Then rotate your password and MFA with the recovery script.</p>} action={revokeAllMySessionsAction} />
        </>} />
      {rows.length === 0 ? <Empty dark title="Nothing to review">No {show === "open" ? "unresolved " : ""}security events.</Empty> : (
        <Table dark caption="Security events">
          <thead><tr><th>When</th><th>Event</th><th>Severity</th><th>Scope</th><th>Details</th><th></th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td className="text-xs text-g300 whitespace-nowrap">{fmtDate(s.at)}</td>
              <td>{s.kind.replace(/_/g, " ")}{s.requires_review && <span className="ml-2 text-[0.7rem] text-[#ffd27a]">needs review</span>}</td>
              <td><Badge tone={s.severity}>{s.severity}</Badge></td>
              <td className="text-g300 text-xs">{s.college ?? "Platform"}{s.election && <><br />{s.election}</>}</td>
              <td className="max-w-xs break-words font-mono text-[0.72rem] text-g400">{JSON.stringify(s.details)}</td>
              <td>{s.resolved_at ? <span className="text-xs text-g500">Resolved: {s.resolution}</span> :
                <Confirm triggerClass="text-xs text-lime underline" trigger="Resolve" title="Resolve this event?" confirmLabel="Resolve" body={<p>Record what was checked and decided. This is audit-logged.</p>} action={resolveIncidentAction} hidden={{ id: s.id }} reasonLabel="Resolution" />}</td>
            </tr>))}
          </tbody>
        </Table>
      )}
      <Card dark className="mt-6 text-sm text-g300">
        <h2 className="mb-2 font-semibold text-paper">Investigation policy</h2>
        <p>Integrity investigations use aggregate data and participation records only. Ballot choices of secret-ballot elections are stored without voter references, so no console screen can reveal how a named student voted. See <span className="font-mono">docs/VOTING_INTEGRITY.md</span>.</p>
      </Card>
    </>
  );
}
