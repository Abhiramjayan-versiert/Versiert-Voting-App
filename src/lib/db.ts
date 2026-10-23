import "server-only";
import postgres from "postgres";
import { env } from "./env";

export type Sql = postgres.Sql;
export type Ctx =
  | { role: "super_admin"; userId: string }
  | { role: "college_admin"; userId: string; collegeIds: string[] }
  | { role: "system"; userId?: string };

const g = globalThis as unknown as { __vappSql?: Sql };

export function sql(): Sql {
  if (!g.__vappSql) {
    g.__vappSql = postgres(env().DATABASE_URL, {
      max: env().DB_POOL_MAX,
      prepare: false, // compatible with transaction-mode poolers (Supabase/Neon)
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      transform: { undefined: null },
      // Fail fast instead of hanging if a lock is ever contended.
      connection: { lock_timeout: 10_000, statement_timeout: 60_000, idle_in_transaction_session_timeout: 60_000, application_name: "vapp" },
    });
  }
  return g.__vappSql;
}

/** Runs fn in a transaction with the RLS context set. Every tenant query must go through this. */
export async function withCtx<T>(ctx: Ctx, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const collegeIds = ctx.role === "college_admin" ? `{${ctx.collegeIds.join(",")}}` : "";
  return (await sql().begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`select set_config('app.role', ${ctx.role}, true),
                   set_config('app.user_id', ${ctx.userId ?? ""}, true),
                   set_config('app.college_ids', ${collegeIds}, true)`;
    return fn(t);
  })) as T;
}

export const systemCtx: Ctx = { role: "system" };
