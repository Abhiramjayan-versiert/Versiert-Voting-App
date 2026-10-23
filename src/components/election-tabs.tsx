"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function ElectionTabs({ base, status }: { base: string; status: string }) {
  const path = usePathname();
  const setup = ["details", "voters", "positions", "rules", "review"];
  const tabs = [
    { href: base, label: "Overview", match: (p: string) => p === base },
    { href: `${base}/${status === "draft" ? "details" : "review"}`, label: status === "draft" ? "Setup" : "Configuration", match: (p: string) => setup.some((s) => p.startsWith(`${base}/${s}`)) },
    { href: `${base}/preview`, label: "Ballot preview" },
    { href: `${base}/monitor`, label: "Live monitor" },
    { href: `${base}/results`, label: "Results" },
    { href: `${base}/exports`, label: "Exports" },
    { href: `${base}/audit`, label: "Activity" },
  ];
  return (
    <nav aria-label="Election sections" className="-mx-4 mb-7 overflow-x-auto border-b border-g200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.match ? t.match(path) : path.startsWith(t.href);
          return (
            <li key={t.label}><Link href={t.href} aria-current={active ? "page" : undefined}
              className={cx("relative inline-flex h-11 items-center px-3 text-sm", active ? "font-medium text-ink" : "text-g500 hover:text-ink")}>
              {t.label}{active && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-lime" aria-hidden />}
            </Link></li>
          );
        })}
      </ul>
    </nav>
  );
}
