import { loadElection } from "@/lib/election-page";
import { Card, Notice } from "@/components/ui";

export const metadata = { title: "Exports" };
export default async function Exports({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { e } = await loadElection(cid, eid);
  const st = e.effective as string;
  const resultsReady = ["results_pending", "published", "retention"].includes(st) || ((st === "open" || st === "paused") && e.admin_live_results);
  const items = [
    { k: "report.xlsx", t: "Election report (Excel)", d: "Summary, candidate-wise results, position summary and participation — one workbook, separate sheets.", ok: resultsReady },
    { k: "candidates.csv", t: "Candidate-wise results (CSV)", d: "College, event, reference, position, candidate, votes, percentage, winner/tie status, closing time, publication status.", ok: resultsReady },
    { k: "positions.csv", t: "Position summary (CSV)", d: "Eligible voters, participants, turnout, valid ballots, abstentions and outcome per position.", ok: resultsReady },
    { k: "participation.csv", t: "Participation statistics (CSV)", d: "Aggregate turnout by position and by voter group. No individual voter data.", ok: st !== "draft" },
    { k: "audit.csv", t: "Administrative audit records (CSV)", d: "This election's administrative actions. Contains no ballot choices.", ok: true },
    ...(!e.secret_ballot ? [{ k: "open-register.xlsx", t: "Open-ballot voting record", d: "Voter-by-voter choices. Available only because this election was configured as an open ballot.", ok: resultsReady }] : []),
  ];
  return (
    <div className="space-y-4">
      {st === "deleted" && <Notice tone="info">Election data has been deleted; only retained aggregate results can be exported.</Notice>}
      <p className="text-sm text-g600">Exports never include individual secret-ballot choices, and text cells are protected against spreadsheet formula injection. {resultsReady && !["published", "retention"].includes(st) ? "Results exports are marked PROVISIONAL until published." : ""}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.k} className={i.ok ? "" : "opacity-60"}>
            <h2 className="font-semibold">{i.t}</h2>
            <p className="mt-1 text-sm text-g600">{i.d}</p>
            {i.ok ? <a href={`/api/exports/${eid}/${i.k}`} className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper hover:bg-g800" download>Download</a>
              : <p className="mt-4 text-sm text-g500">Available after voting closes.</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
