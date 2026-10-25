import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { PageHeader, Table, Badge, relTime, fmtDate, Empty, Notice } from "@/components/ui";
import { InviteAdminForm } from "@/components/invite-form";

export const metadata = { title: "Administrators" };
export default async function Admins({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { ctx } = await requireSuperAdmin();
  const { rows, colleges } = await withCtx(ctx, async (tx) => ({
    rows: await tx`
      select u.id, u.name, u.email, u.status, u.last_login_at, u.created_at, u.mfa_enabled,
             coalesce(array_agg(c.name order by c.name) filter (where c.id is not null), '{}') as colleges,
             (select count(*)::int from elections e where e.created_by = u.id) as managed,
             (select bool_or(t.used_at is null and t.expires_at > now()) from auth_tokens t where t.user_id = u.id and t.purpose = 'invite') as invite_pending
        from users u left join college_admins ca on ca.user_id = u.id left join colleges c on c.id = ca.college_id
       where u.role = 'college_admin' group by u.id order by u.name`,
    colleges: await tx`select id, name from colleges where status = 'active' order by name`,
  }));
  return (
    <>
      {sp.deleted && <Notice tone="success" className="mb-5">Administrator account deleted. Their past actions remain in the audit log.</Notice>}
      <PageHeader dark eyebrow="Platform" title="College administrators" description="Invite, edit, assign, suspend, revoke or delete. Access is enforced on the server and in the database." />
      {rows.length === 0 ? <Empty dark title="No administrators yet">Invite one below.</Empty> : (
        <Table dark caption="College administrators">
          <thead><tr><th>Name</th><th>Colleges</th><th>Status</th><th>Invitation</th><th>MFA</th><th>Last login</th><th>Created</th><th>Elections</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/platform/admins/${u.id}`} className="font-medium hover:text-lime">{u.name}</Link><span className="block text-xs text-g500">{u.email}</span></td>
              <td className="text-g300">{u.colleges.join(", ") || "-"}</td>
              <td><Badge tone={u.status}>{u.status}</Badge></td>
              <td className="text-g300">{u.status === "invited" ? (u.invite_pending ? "Pending" : "Expired") : "Accepted"}</td>
              <td>{u.mfa_enabled ? "On" : "Off"}</td>
              <td className="text-g300">{relTime(u.last_login_at)}</td><td className="text-g300">{fmtDate(u.created_at)}</td><td className="tabular">{u.managed}</td>
            </tr>))}
          </tbody>
        </Table>
      )}
      <div className="mt-8 rounded-[var(--radius-card)] bg-paper p-5 text-ink sm:p-7">
        <h2 className="mb-4 text-lg font-semibold">Invite an administrator</h2>
        {colleges.length ? <InviteAdminForm colleges={colleges as never} /> : <p className="text-sm text-g600">Create an active college first.</p>}
      </div>
    </>
  );
}
