import "server-only";
import { sql } from "./db";

/** Fixed-window limiter stored in Postgres (works across serverless instances, no Redis needed). */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const [r] = await sql()`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count, window_start`;
  const count = Number(r.count);
  return { ok: count <= limit, count, retryAfterSec: count <= limit ? 0 : windowSec };
}

export async function pruneRateLimits() {
  const r = await sql()`delete from rate_limits where window_start < now() - interval '1 day'`;
  return r.count;
}
