import "server-only";
import { headers } from "next/headers";
import { env } from "./env";
import { hmac } from "./crypto";

export async function clientIp() {
  const h = await headers();
  // On Vercel x-forwarded-for is set by the platform edge; first entry is the client.
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "0.0.0.0").trim();
}
/** IPs are never stored raw, only as a keyed hash, useful for correlation and rate limits. */
export async function ipHash() {
  return hmac(env().HMAC_SECRET, "ip:" + (await clientIp())).slice(0, 32);
}
export async function userAgent() {
  return ((await headers()).get("user-agent") ?? "").slice(0, 200);
}
/** CSRF defence for route handlers (Server Actions get Next.js' built-in Origin check). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin), host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env().APP_URL).origin;
  } catch { return false; }
}
