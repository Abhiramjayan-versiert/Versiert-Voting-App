import { Bars, Card, Badge, Table } from "./ui";
import type { ElectionResult } from "@/lib/results";

export function ResultsView({ r, provisional, dark, percentOnly }: { r: ElectionResult; provisional?: boolean; dark?: boolean; percentOnly?: boolean }) {
  return (
    <div className="space-y-5">
      {r.positions.map((p) => {
        const winners = p.candidates.filter((c) => c.outcome === "winner");
        const tied = p.candidates.filter((c) => c.outcome === "tied");
        return (
          <Card key={p.id} dark={dark} className="print-break">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-g500">{percentOnly ? `Turnout ${p.turnoutPct.toFixed(1)}%` : `${p.participants.toLocaleString("en-IN")} of ${p.eligible.toLocaleString("en-IN")} eligible voted (${p.turnoutPct.toFixed(1)}%)`}{!percentOnly && p.abstentions ? ` · ${p.abstentions} abstained` : ""}{p.seats > 1 ? ` · ${p.seats} seats` : ""}</p>
              </div>
              {p.status === "no_votes" ? <Badge tone="info">No valid votes</Badge>
                : p.status === "tie" ? <Badge tone="warning">Tie, needs resolution</Badge>
                : <Badge tone={provisional ? "results_pending" : "published"}>{provisional ? "Leading" : winners.length > 1 ? "Winners" : "Winner"}: {winners.map((w) => w.name).join(", ")}</Badge>}
            </div>
            {p.status === "tie" && (
              <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                {tied.map((t) => t.name).join(" and ")} are tied{winners.length ? ` for the remaining seat${p.seats - winners.length > 1 ? "s" : ""}` : ""}. V.app does not break ties, follow your college's documented tie-break policy.
              </p>
            )}
            <div className="mt-5">
              <Bars dark={dark} hideValues={percentOnly} label={`Votes for ${p.name}`} items={p.candidates.map((c) => ({
                label: c.name + (c.status !== "active" ? ` (${c.status})` : ""), value: c.votes, pct: c.pct,
                highlight: c.outcome === "winner", note: c.outcome === "winner" ? (provisional ? "Leading" : "Winner") : c.outcome === "tied" ? "Tie" : undefined,
              }))} />
            </div>
            {!percentOnly && <details className="mt-4 text-sm"><summary className="cursor-pointer text-g500 underline">Show as table</summary>
              <div className="mt-3"><Table dark={dark} caption={`${p.name} results`}>
                <thead><tr><th>Candidate</th><th>Votes</th><th>Share of valid votes</th><th>Outcome</th></tr></thead>
                <tbody>{p.candidates.map((c) => <tr key={c.id}><td>{c.name}</td><td className="tabular">{c.votes}</td><td className="tabular">{c.pct.toFixed(2)}%</td><td>{c.outcome === "winner" ? (provisional ? "Leading" : "Winner") : c.outcome === "tied" ? "Tied" : "-"}</td></tr>)}</tbody>
              </Table></div>
            </details>}
          </Card>
        );
      })}
    </div>
  );
}
