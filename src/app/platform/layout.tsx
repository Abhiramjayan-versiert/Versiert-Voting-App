import { AdminShell } from "@/components/admin-shell";
import { requireSuperAdmin } from "@/lib/auth";
import { isTestMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Developer console", template: "%s · Developer console · V.app" }, robots: { index: false } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { s } = await requireSuperAdmin();
  const items = [
    { href: "/platform", label: "Overview", exact: true, section: "Platform" },
    { href: "/platform/colleges", label: "Colleges" },
    { href: "/platform/admins", label: "Administrators" },
    { href: "/platform/elections", label: "Elections" },
    { href: "/platform/security", label: "Security events", section: "Oversight" },
    { href: "/platform/audit", label: "Audit log" },
    { href: "/platform/jobs", label: "Jobs & cleanup" },
    { href: "/platform/health", label: "Health & backups" },
    { href: "/platform/config", label: "Configuration", section: "Settings" },
    ...(isTestMode() ? [{ href: "/platform/mailbox", label: "Test mailbox" }] : []),
  ];
  return (
    <AdminShell dark items={items} user={s.user} roleLabel="Developer · Super Admin"
      top={isTestMode() ? <p className="mx-2 mb-3 rounded-lg border border-lime/40 bg-lime/10 px-3 py-2 text-[0.75rem] text-lime">TEST MODE — fictional data</p> : null}>
      {children}
    </AdminShell>
  );
}
