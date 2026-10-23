import { loadElection } from "@/lib/election-page";
import { withCtx } from "@/lib/db";
import { Notice, fmtDate } from "@/components/ui";
import { Ballot } from "@/components/ballot";

export const metadata = { title: "Ballot preview" };
export default async function Preview({ params }: { params: Promise<{ cid: string; eid: string }> }) {
  const { cid, eid } = await params;
  const { ctx, e } = await loadElection(cid, eid);
  const d = await withCtx(ctx, async (tx) => ({
    positions: await tx`select id, name, description, max_selections, false as voted from positions where election_id = ${eid} order by sort_order, name`,
    candidates: await tx`select id, position_id, full_name, department, year_label, intro, manifesto, symbol, (photo is not null) as has_photo from candidates where election_id = ${eid} and status = 'active' order by sort_order, full_name`,
  }));
  return (
    <>
      <Notice tone="info" className="mb-4" title="Preview mode">This is exactly what an eligible student sees (all positions shown). Selections here are not saved and cannot be submitted.</Notice>
      <div className="mx-auto max-w-2xl rounded-3xl border border-g200 px-4 pt-2 sm:px-6">
        <Ballot preview slug={e.slug} title={e.title} closesLabel={fmtDate(e.ends_at, e.timezone)} allowAbstain={e.allow_abstain} requireAll={e.require_all_positions}
          positions={d.positions as never} candidates={d.candidates as never} />
      </div>
    </>
  );
}
