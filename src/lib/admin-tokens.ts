import "server-only";
import { sql } from "./db";
import { sha256, encrypt, newTotpSecret } from "./crypto";
import { env } from "./env";

export async function consumeToken(token: string, purpose: "invite" | "password_reset") {
  if (!token || token.length > 100) return null;
  const [t] = await sql()`select t.*, u.email, u.name, u.role, u.status from auth_tokens t join users u on u.id = t.user_id
                           where t.token_hash = ${sha256(token)} and t.purpose = ${purpose} and t.used_at is null and t.expires_at > now()`;
  return t ?? null;
}
export async function peekToken(token: string, purpose: "invite" | "password_reset") {
  const t = await consumeToken(token, purpose);
  return t ? { email: t.email as string, name: t.name as string } : null;
}


/** Pending MFA enrolment, sealed (AES-GCM) into the form so no server state is needed. */
export function sealPendingMfa(userId: string) {
  const secret = newTotpSecret();
  return { secret, sealed: encrypt(JSON.stringify({ secret, uid: userId, exp: Date.now() + 15 * 60_000 }), env().ENCRYPTION_KEY) };
}
