import Link from "next/link";
import { Logo } from "./ui";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="safe-top border-b border-g100">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {right ?? (<>
            <Link href="/vote" className="hidden sm:inline-flex h-9 items-center rounded-full px-3.5 hover:bg-g100">Vote</Link>
            <Link href="/help" className="hidden sm:inline-flex h-9 items-center rounded-full px-3.5 hover:bg-g100">Help</Link>
            <Link href="/admin/login" className="inline-flex h-9 items-center rounded-full border border-g300 px-4 hover:border-ink">Administrators</Link>
          </>)}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="safe-bottom mt-24 border-t border-g100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo size={22} />
          <p className="mt-2 text-sm text-g500">Every valid vote counts.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-g600">
          <Link href="/vote" className="hover:text-ink">Find your election</Link>
          <Link href="/receipt" className="hover:text-ink">Check a receipt</Link>
          <Link href="/help" className="hover:text-ink">Student help</Link>
          <Link href="/privacy" className="hover:text-ink">Voting privacy</Link>
          <Link href="/help/admin" className="hover:text-ink">Administrator guide</Link>
        </nav>
      </div>
    </footer>
  );
}
