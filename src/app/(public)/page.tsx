import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site";
import { ButtonLink } from "@/components/ui";

const steps = [
  { n: "01", t: "Open your election link", d: "Your election administrator shares a link. No app store, no new account." },
  { n: "02", t: "Verify it's you", d: "Enter your college email and student ID. Both must match the voter list your college uploaded." },
  { n: "03", t: "Choose, review, submit", d: "One vote per position. Review everything before you submit — then it's final." },
];

const trust = [
  { t: "One vote per position — enforced by the database", d: "A unique constraint on election, voter and position means a second ballot for the same position can never be counted, even from two tabs at once." },
  { t: "Who voted is stored apart from how they voted", d: "Participation and ballot choices live in separate tables with no shared key, no voter ID and no timestamp on the choice." },
  { t: "Tamper-evident audit trail", d: "Every administrative action is written to a hash-chained, append-only log that is checked before results are published." },
  { t: "Data that doesn't linger", d: "After results are published, voter lists and ballots are deleted on a schedule set before the election opens." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-24">
          <div className="animate-in">
            <p className="eyebrow text-g500">Welcome to V.app</p>
            <h1 className="display mt-5">
              Your campus.<br />
              <span className="relative inline-block">
                <span className="relative z-10">Your choice.</span>
                <span className="absolute inset-x-[-0.08em] bottom-[0.06em] z-0 h-[0.34em] bg-lime" aria-hidden />
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg text-g600">
              Secure digital elections for student unions, clubs and campus associations — simple for students, accountable for administrators, private by design.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/vote" variant="primary" size="lg">Find your election</ButtonLink>
              <ButtonLink href="/admin/login" variant="outline" size="lg">Run an election</ButtonLink>
            </div>
          </div>

          <div aria-hidden className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[22px] bg-ink p-5 text-paper shadow-[0_30px_80px_-30px_rgba(8,8,8,0.55)]">
              <div className="flex items-center justify-between text-[0.72rem] text-g400">
                <span>College Union Election</span><span className="rounded-full bg-lime px-2 py-0.5 font-medium text-ink">Open</span>
              </div>
              <p className="mt-4 text-[0.72rem] uppercase tracking-[0.14em] text-g400">Position 1 of 4</p>
              <p className="mt-1 text-xl font-semibold">Chairperson</p>
              <div className="mt-4 space-y-2.5">
                {["Candidate A", "Candidate B", "Candidate C"].map((n, i) => (
                  <div key={n} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${i === 1 ? "border-lime bg-lime/10" : "border-g700"}`}>
                    <span className={`grid size-9 place-items-center rounded-full text-sm font-semibold ${i === 1 ? "bg-lime text-ink" : "bg-g800 text-g300"}`}>{n.slice(-1)}</span>
                    <span className="flex-1 text-sm">{n}</span>
                    <span className={`grid size-5 place-items-center rounded-full border ${i === 1 ? "border-lime bg-lime" : "border-g600"}`}>
                      {i === 1 && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 3" stroke="#080808" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 h-1.5 rounded-full bg-g800"><div className="h-full w-1/4 rounded-full bg-lime" /></div>
            </div>
            <p className="mt-3 text-center text-xs text-g400">Illustration</p>
          </div>
        </section>

        <section className="border-y border-g100 bg-g50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold">How voting works</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-[var(--radius-card)] border border-g200 bg-paper p-6">
                  <span className="font-mono text-sm text-g400">{s.n}</span>
                  <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
                  <p className="mt-2 text-g600">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow text-g500">Built for trust</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight">Every valid vote counts. Nothing else does.</h2>
              <p className="mt-4 text-g600">We describe exactly what V.app guarantees — and what it doesn't — in plain language.</p>
              <Link href="/privacy" className="mt-6 inline-block font-medium underline decoration-lime decoration-[3px] underline-offset-4 hover:decoration-ink">Read the voting privacy model</Link>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-g200 bg-g200 sm:grid-cols-2">
              {trust.map((t) => (
                <div key={t.t} className="bg-paper p-6">
                  <h3 className="font-semibold">{t.t}</h3>
                  <p className="mt-2 text-sm text-g600">{t.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
