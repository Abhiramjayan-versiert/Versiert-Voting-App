import "server-only";
import { env } from "./env";
import { safeEqual } from "./crypto";
/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is rejected. */
export function cronAuthorized(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  return safeEqual(h, `Bearer ${env().CRON_SECRET}`);
}
