import "server-only";
import { sql, type Sql } from "./db";

export type AuditInput = {
  actorId?: string | null; actorLabel: string; collegeId?: string | null; electionId?: string | null;
  action: string; target?: string | null; details?: Record<string, unknown>; ipHash?: string | null;
};

const FORBIDDEN_KEYS = /(password|otp|code|token|secret|candidate_ids|choice)/i;

function scrub(d: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) out[k] = FORBIDDEN_KEYS.test(k) ? "[redacted]" : v;
  return out;
}

/** Appends to the hash-chained audit log. Pass tx to make it part of the same transaction. */
export async function audit(a: AuditInput, tx?: Sql) {
  const q = tx ?? sql();
  await q`insert into audit_events (actor_id, actor_label, college_id, election_id, action, target, details, ip_hash)
          values (${a.actorId ?? null}, ${a.actorLabel}, ${a.collegeId ?? null}, ${a.electionId ?? null},
                  ${a.action}, ${a.target ?? null}, ${q.json(scrub(a.details) as never)}, ${a.ipHash ?? null})`;
}

export async function securityEvent(
  e: { kind: string; severity: "info" | "warning" | "critical"; collegeId?: string | null; electionId?: string | null;
       requiresReview?: boolean; details?: Record<string, unknown>; ipHash?: string | null },
  tx?: Sql,
) {
  const q = tx ?? sql();
  await q`insert into security_events (kind, severity, college_id, election_id, requires_review, details, ip_hash)
          values (${e.kind}, ${e.severity}, ${e.collegeId ?? null}, ${e.electionId ?? null}, ${e.requiresReview ?? false},
                  ${q.json(scrub(e.details) as never)}, ${e.ipHash ?? null})`;
}
