"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; exact?: boolean; section?: string };

export function NavLinks({ items, dark }: { items: NavItem[]; dark?: boolean }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        const header = it.section && it.section !== lastSection ? it.section : null;
        lastSection = it.section ?? lastSection;
        return (
          <li key={it.href}>
            {header && <p className={cx("eyebrow px-3 pt-5 pb-1.5", dark ? "text-g500" : "text-g400")}>{header}</p>}
            <Link href={it.href} aria-current={active ? "page" : undefined}
              className={cx("relative flex h-10 items-center rounded-lg px-3 text-[0.92rem] transition-colors",
                dark ? (active ? "bg-g800 text-paper" : "text-g300 hover:bg-g900 hover:text-paper") : active ? "bg-g100 text-ink font-medium" : "text-g600 hover:bg-g50 hover:text-ink")}>
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-lime" aria-hidden />}
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileMenu({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium", dark ? "border-g700 text-paper" : "border-g300")}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={open ? "M3.5 3.5l9 9M12.5 3.5l-9 9" : "M2 4.5h12M2 8h12M2 11.5h12"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div id="mobile-nav" className={cx("fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto px-4 pb-10 pt-2 animate-in", dark ? "dark-surface bg-ink text-paper" : "bg-paper")}>
          {children}
        </div>
      )}
    </>
  );
}
