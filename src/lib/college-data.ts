import "server-only";
import type { Sql } from "./db";
import { effectiveStatus } from "./lifecycle";

export async function electionsWithStats(tx: Sql, collegeId: string) {
  const rows = await tx`
    select e.id, e.title, e.event_name, e.status, e.starts_at, e.ends_at, e.timezone, e.slug, e.public_ref, e.published_at, e.purge_after, e.created_at,
      (select count(*)::int from voters v where v.election_id = e.id) as voters,
      (select count(distinct voter_id)::int from participations p where p.election_id = e.id) as participants,
      (select count(*)::int from positions p where p.election_id = e.id) as positions,
      (select count(*)::int from candidates c where c.election_id = e.id) as candidates,
      (select count(*)::int from security_events s where s.election_id = e.id and s.requires_review and s.resolved_at is null) as flags
    from elections e where e.college_id = ${collegeId} order by coalesce(e.starts_at, e.created_at) desc`;
  return rows.map((r) => ({ ...r, effective: effectiveStatus(r as never) })) as Record<string, any>[];
}
