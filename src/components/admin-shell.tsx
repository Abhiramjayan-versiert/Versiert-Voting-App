import { Logo, cx } from "./ui";
import { NavLinks, MobileMenu, type NavItem } from "./nav";
import { logoutAction } from "@/app/admin/actions";

export function AdminShell({ dark, items, user, roleLabel, children, top }: {
  dark?: boolean; items: NavItem[]; user: { name: string; email: string }; roleLabel: string; children: React.ReactNode; top?: React.ReactNode;
}) {
  const footer = (
    <div className={cx("border-t pt-4", dark ? "border-g800" : "border-g700")}>
      <p className="truncate text-sm font-medium text-paper">{user.name}</p>
      <p className="truncate text-xs text-g400">{user.email}</p>
      <p className="mt-1 text-[0.7rem] uppercase tracking-[0.12em] text-lime">{roleLabel}</p>
      <div className="mt-3 flex gap-2">
        <a href="/account" className="inline-flex h-8 items-center rounded-full border border-g600 px-3 text-xs text-g200 hover:border-lime">Account</a>
        <form action={logoutAction}><button className="inline-flex h-8 items-center rounded-full border border-g600 px-3 text-xs text-g200 hover:border-lime">Sign out</button></form>
      </div>
    </div>
  );
  return (
    <div className={cx("min-h-dvh lg:grid lg:grid-cols-[260px_1fr]", dark && "dark-surface bg-ink text-paper")}>
      <aside className="dark-surface sticky top-0 hidden h-dvh flex-col justify-between overflow-y-auto border-r border-g800 bg-ink p-4 text-paper lg:flex">
        <div>
          <div className="px-2 pt-1 pb-3"><Logo dark size={26} href={null} /></div>
          {top}
          <nav aria-label="Primary"><NavLinks items={items} dark /></nav>
        </div>
        {footer}
      </aside>
      <div className={cx("dark-surface safe-top sticky top-0 z-30 flex h-16 items-center justify-between border-b border-g800 bg-ink px-4 text-paper lg:hidden")}>
        <Logo dark size={24} href={null} />
        <MobileMenu dark>
          {top}
          <nav aria-label="Primary"><NavLinks items={items} dark /></nav>
          <div className="mt-6">{footer}</div>
        </MobileMenu>
      </div>
      <main id="main" className="min-w-0 px-4 py-7 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl animate-in">{children}</div>
      </main>
    </div>
  );
}
