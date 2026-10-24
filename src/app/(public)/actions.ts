"use server";
import { redirect } from "next/navigation";
import { withCtx, systemCtx } from "@/lib/db";
import { run, str } from "@/lib/action-utils";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash } from "@/lib/request";
import type { ActionState } from "@/components/forms";

export async function findElectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "";
  const res = await run(async () => {
    const raw = str(fd, "q").trim();
    const m = raw.match(/\/e\/([a-z0-9-]+)/i) ?? raw.match(/^([a-z0-9-]{4,90})$/i);
    const ref = raw.toUpperCase().match(/^E-[0-9A-F]{10}$/)?.[0];
    if (!(await rateLimit(`find:${await ipHash()}`, 60, 3600)).ok) return { error: "Too many searches. Try again later." };
    const [e] = await withCtx(systemCtx, (tx) => tx`select slug from elections where status <> 'draft' and (slug = ${m?.[1]?.toLowerCase() ?? ""} or public_ref = ${ref ?? ""})`);
    if (!e) return { error: "We couldn't find an election with that link or reference. Check the link your election administrator shared." };
    dest = `/e/${e.slug}`;
  });
  if (dest) redirect(dest);
  return res;
}

export async function checkReceiptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const code = str(fd, "code").toUpperCase().replace(/\s/g, "");
    if (!(await rateLimit(`receipt:${await ipHash()}`, 30, 3600)).ok) return { error: "Too many checks. Try again later." };
    if (/^VC-/.test(code)) {
      if (!/^VC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(code)) return { error: "Verification codes look like VC-XXXX-XXXX-XXXX." };
      const rows = await withCtx(systemCtx, (tx) => tx`select * from ballot.check_lookup(${code})`);
      if (!rows.length) return { error: "No ballot with that verification code was found. If the election's retention period has ended, its records have been deleted." };
      const byPos = new Map<string, string[]>();
      for (const r of rows) byPos.set(r.position_name, [...(byPos.get(r.position_name) ?? []), r.candidate_name]);
      return { ok: true, data: { verified: { election: rows[0].election_title, college: rows[0].college_name,
        choices: [...byPos].map(([position, candidates]) => ({ position, candidates })) } } };
    }
    if (!/^VA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code)) return { error: "Codes look like VA-XXXX-XXXX-XXXX (confirmation) or VC-XXXX-XXXX-XXXX (verification)." };
    const [r] = await withCtx(systemCtx, (tx) => tx`select s.created_at, e.title, e.timezone from vote_submissions s join elections e on e.id = s.election_id where s.receipt_code = ${code}`);
    if (!r) return { error: "No ballot with that confirmation code was found. If the election's retention period has ended, its records have been deleted." };
    const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: r.timezone }).format(new Date(r.created_at));
    return { ok: true, message: `Recorded: a ballot with this code was accepted for “${r.title}” on ${when}. Choices are never shown.` };
  });
}
