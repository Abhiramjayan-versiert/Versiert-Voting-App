import { Logo } from "./ui";

export function AuthShell({ title, subtitle, children, eyebrow = "Administrator access" }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="dark-surface relative hidden flex-col justify-between bg-ink p-10 text-paper lg:flex">
        <Logo dark />
        <div>
          <p className="text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em]">Every valid<br />vote counts.</p>
          <p className="mt-5 max-w-sm text-g400">Administrative access is logged in a tamper-evident audit trail. Never share your credentials or authenticator codes.</p>
        </div>
        <div className="flex gap-1.5" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={`h-1 rounded-full ${i === 0 ? "w-10 bg-lime" : "w-4 bg-g700"}`} />)}</div>
      </aside>
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="m-auto w-full max-w-md py-10 animate-in">
          <p className="eyebrow text-g500">{eyebrow}</p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-tight">{title}</h1>
          {subtitle && <div className="mt-2 text-g600">{subtitle}</div>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
