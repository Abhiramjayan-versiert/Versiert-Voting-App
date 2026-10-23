import { SiteHeader, SiteFooter } from "@/components/site";
import { Prose } from "@/components/prose";

export const metadata = { title: "Administrator guide" };
export default function AdminGuide() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-14">
        <p className="eyebrow text-g500">Administrator guide</p>
        <h1 className="mt-3 text-[2.4rem] font-semibold leading-tight">Running an election on V.app</h1>
        <Prose>
          <h2>1. Create the election</h2>
          <p>Dashboard → <strong>New election</strong>. Enter the event name, title, voting window and timezone. Everything stays editable while the election is a draft.</p>
          <h2>2. Import eligible voters</h2>
          <ul>
            <li>Upload <code>.xlsx</code>, <code>.xls</code> or <code>.csv</code> (first sheet, headers in row 1, max 4 MB). An email column is required; name, student ID and group are optional.</li>
            <li>Preview shows accepted, invalid and duplicate rows before anything is saved. Download the rejected rows, fix them, and upload again — existing addresses are skipped, never duplicated.</li>
            <li>The spreadsheet itself is never stored.</li>
          </ul>
          <h2>3. Positions and candidates</h2>
          <p>Add positions in ballot order. Each voter may vote <strong>once per position</strong>. Use “choices per voter” for multi-seat positions and “voter groups” to restrict a position (e.g. only CSE students elect the CSE representative). Add candidates with optional photo, introduction and manifesto, then use <strong>Ballot preview</strong>.</p>
          <h2>4. Voting rules</h2>
          <p>Secret ballot (default) or open ballot, abstention, whether every position is required, live tallies, approval before publication, and the data-retention period.</p>
          <h2>5. Review and activate</h2>
          <p>Activation locks the configuration. The election opens and closes automatically. Until it opens you can return it to draft.</p>
          <h2>During voting</h2>
          <ul>
            <li><strong>Live monitor</strong> shows turnout by position, blocked duplicate attempts and, if enabled, provisional tallies.</li>
            <li>Emergencies: <strong>Pause</strong> (sessions end immediately), make an amendment (add voters, withdraw a candidate — always with a written reason), then <strong>Resume</strong>, optionally extending the closing time. Submitted ballots can never be edited or deleted by anyone.</li>
            <li><strong>Report an incident</strong> if something looks wrong; publication is blocked until it's resolved with a note.</li>
          </ul>
          <h2>Publishing results</h2>
          <p>After closing, review the integrity checks (ballot counts match participation, no duplicates, audit chain intact, no open incidents), then publish. Ties are displayed as ties — apply your college's tie-break rules. You may unpublish within 24 hours if your settings allow it.</p>
          <h2>Exports</h2>
          <p>Excel report (summary, candidate results, position summary, participation by group), CSVs, rejected import rows, and the election's audit records. Secret-ballot choices are never exported.</p>
          <h2>Retention</h2>
          <p>On the date shown on the overview page, voter and ballot data is deleted automatically. You'll get an email beforehand. Export anything you need first.</p>
        </Prose>
      </main>
      <SiteFooter />
    </>
  );
}
