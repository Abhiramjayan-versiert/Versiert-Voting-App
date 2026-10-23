import Link from "next/link";
import { Logo } from "./ui";

export function VoterShell({ college, collegeId, hasLogo, children, slug }: { college: string; collegeId: string; hasLogo: boolean; children: React.ReactNode; slug: string }) {
  return (
    <div className="min-h-dvh">
      <header className="safe-top border-b border-g100">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
          <Link href={`/e/${slug}`} className="flex min-w-0 items-center gap-2.5">
            {hasLogo ? <img src={`/media/logo/${collegeId}`} alt="" className="size-8 shrink-0 rounded-md object-contain" /> : null}
            <span className="truncate text-sm font-medium">{college}</span>
          </Link>
          <Logo size={22} href="/" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="safe-bottom mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-g500">
        <Link href="/help" className="underline">Help</Link> · <Link href="/privacy" className="underline">Voting privacy</Link> · Every valid vote counts.
      </footer>
    </div>
  );
}
