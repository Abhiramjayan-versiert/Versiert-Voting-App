import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { Logo, Empty } from "@/components/ui";
import { logoutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";
export default async function CollegeIndex() {
  const { s, ctx } = await requireCollegeAdmin();
  const isSuper = s.user.role === "super_admin";
  if (!isSuper && s.collegeIds.length === 1) redirect(`/college/${s.collegeIds[0]}`);
  const cols = isSuper || s.collegeIds.length ? await withCtx(ctx, (tx) => tx`select id, name, city from colleges order by name`) : [];
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-12">
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold">Choose a college</h1>
      {isSuper && <Link href="/platform" className="mt-2 inline-block text-sm text-g500 underline">← Back to developer console</Link>}
      {cols.length === 0 ? (
        <div className="mt-6"><Empty title="No active college assignments">Your account isn't assigned to an active college. Contact the platform administrator.</Empty>
          <form action={logoutAction} className="mt-4"><button className="text-sm underline">Sign out</button></form></div>
      ) : (
        <ul className="mt-6 space-y-2">{cols.map((c) => (
          <li key={c.id}><Link href={`/college/${c.id}`} className="flex items-center justify-between rounded-xl border border-g200 px-5 py-4 hover:border-ink"><span><span className="font-medium">{c.name}</span><span className="block text-sm text-g500">{c.city}</span></span><span aria-hidden>→</span></Link></li>))}
        </ul>
      )}
    </main>
  );
}
