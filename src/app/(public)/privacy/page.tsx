import { SiteHeader, SiteFooter } from "@/components/site";
import { Prose } from "@/components/prose";

export const metadata = { title: "Voting privacy" };
export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-14">
        <p className="eyebrow text-g500">Privacy model</p>
        <h1 className="mt-3 text-[2.4rem] font-semibold leading-tight">How V.app keeps your vote private</h1>
        <Prose>
          <p className="text-lg">We want you to understand exactly what V.app protects — and what it doesn't — in plain language.</p>
          <h2>What we store when you vote</h2>
          <ul>
            <li><strong>Participation:</strong> that your verified address voted for a given position. This is how we stop anyone voting twice and how administrators see turnout.</li>
            <li><strong>Your choice:</strong> stored in a separate, locked-down table as “one vote for candidate X in position Y”. It has a random ID, <strong>no voter reference and no timestamp</strong>.</li>
            <li>The two records share no key. The application's database account isn't even permitted to read the choice table; only aggregate totals can be retrieved.</li>
          </ul>
          <h2>Who can see what</h2>
          <ul>
            <li><strong>Election administrators</strong> see the voter list, turnout and (depending on the election's settings) running totals. They cannot see how any student voted.</li>
            <li><strong>The platform owner</strong> manages colleges and accounts, and also has no screen or export that reveals individual choices.</li>
            <li><strong>The public</strong> sees published aggregate results only — never names, emails or turnout per person.</li>
          </ul>
          <h2>Honest limits</h2>
          <ul>
            <li>This is privacy enforced by database design and access controls — <strong>not</strong> a cryptographic anonymous-voting protocol. Someone with full, direct database-server access and deep forensic tooling could attempt to correlate records by physical storage order. We document this risk rather than hide it.</li>
            <li>With very few voters, totals themselves can reveal choices (e.g. if only one person voted). Administrators are warned about live tallies for small electorates.</li>
            <li>Verification uses your college email and student ID. Anyone who knows both could try to vote as you — keep your student ID private during elections. It also can't prove nobody is pressuring you. Vote somewhere private.</li>
            <li>An election may be configured as an <strong>open ballot</strong>, where choices are linked to voters. You'll always be told clearly before voting.</li>
          </ul>
          <h2>How long data is kept</h2>
          <p>Each election states its retention period before it opens. When that period ends after results are published, the voter list, verification records, participation and ballot records are deleted. If the college chose to keep it, only the published aggregate results page remains. Deleted data may persist in the database provider's encrypted backups until those backups expire on the provider's schedule.</p>
          <h2>What we never do</h2>
          <ul><li>Put your choices in an email, receipt, notification or log.</li><li>Store your IP address in readable form (only a keyed hash, for abuse prevention).</li><li>Tell anyone whether a given email is on a voter list.</li></ul>
        </Prose>
      </main>
      <SiteFooter />
    </>
  );
}
