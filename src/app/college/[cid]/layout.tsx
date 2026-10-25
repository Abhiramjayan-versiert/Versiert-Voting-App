import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireCollegeAdmin } from "@/lib/auth";
import { withCtx } from "@/lib/db";
import { isUuid } from "@/lib/action-utils";
import { isTestMode } from "@/lib/env";
import { maintenanceScreen } from "@/components/maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Election administration", template: "%s · V.app" }, robots: { index: false } };

export default async function CollegeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!isUuid(cid)) notFound();
  const { s, ctx } = await requireCollegeAdmin(cid);
  const m = await maintenanceScreen(); if (m) return m;
  const [college] = await withCtx(ctx, (tx) => tx`select id, name, (logo is not null) as has_logo from colleges where id = ${cid}`);
  if (!college) notFound();
  const base = `/college/${cid}`;
  const top = (
    <div className="mx-2 mb-4 rounded-xl border border-g800 p-3">
      <div className="flex items-center gap-2.5">
        {college.has_logo && <img src={`/media/logo/${cid}`} alt="" className="size-8 rounded-md bg-paper object-contain" />}
        <p className="text-sm font-medium leading-tight text-paper">{college.name}</p>
      </div>
      {(s.collegeIds.length > 1 || s.user.role === "super_admin") && <Link href="/college" className="mt-2 inline-block text-xs text-g400 underline hover:text-lime">Switch college</Link>}
      {s.user.role === "super_admin" && <Link href="/platform" className="mt-1 block text-xs text-lime underline">← Developer console</Link>}
      {isTestMode() && <p className="mt-2 text-[0.7rem] text-lime">TEST MODE, fictional data</p>}
    </div>
  );
  return (
    <AdminShell items={[
      { href: base, label: "Dashboard", exact: true },
      { href: `${base}/elections`, label: "Elections" },
      { href: `${base}/elections/new`, label: "New election", exact: true },
      ...(s.user.role === "super_admin" ? [{ href: `${base}/audit`, label: "Activity log" }] : []),
      { href: `${base}/profile`, label: "College profile" },
      { href: "/help/admin", label: "Administrator guide" },
    ]} user={s.user} roleLabel={s.user.role === "super_admin" ? "Super Admin · full access" : "College election admin"} top={top}>
      {children}
    </AdminShell>
  );
}
