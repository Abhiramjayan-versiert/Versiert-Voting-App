import { withCtx, systemCtx } from "@/lib/db";
import { toCsv } from "@/lib/exports";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash } from "@/lib/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Anonymous ballot list for a published election: verification code + choices, nothing that identifies a voter. */
export async function GET(_: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!/^E-[0-9A-F]{10}$/.test(ref)) return new Response("Not found", { status: 404 });
  if (!(await rateLimit(`bulletin:${await ipHash()}`, 30, 3600)).ok) return new Response("Too many downloads. Try again later.", { status: 429 });
  const rows = await withCtx(systemCtx, async (tx) => {
    const [e] = await tx`select id from elections where public_ref = ${ref} and status in ('published', 'retention')`;
    return e ? tx`select * from ballot.bulletin(${e.id})` : null;
  });
  if (!rows) return new Response("Not found", { status: 404 });
  const csv = toCsv(["Verification code", "Position", "Choice"], rows.map((r) => [r.check_code, r.position_name, r.candidate_name]));
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${ref}-anonymous-ballots.csv"`,
    "Cache-Control": "no-store",
  } });
}
