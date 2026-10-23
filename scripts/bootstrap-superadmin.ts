/**
 * Provision (or recover) the platform owner account. Run by the developer with the
 * schema-owner connection — this is the ONLY way a Super Admin can be created.
 *
 *   npm run bootstrap:superadmin -- --email you@example.com --name "Your Name"
 *   npm run bootstrap:superadmin -- --email you@example.com --reset     # recovery: new password, MFA reset, sessions revoked
 *
 * A strong temporary password is generated and printed ONCE. Two-step verification
 * enrolment is forced at first sign-in.
 */
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { ownerSql } from "./_db";

const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const email = get("email")?.trim().toLowerCase();
const name = get("name") ?? "Platform Owner";
const reset = args.includes("--reset");
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error("Usage: --email you@example.com [--name \"Name\"] [--reset]"); process.exit(1); }

const password = randomBytes(18).toString("base64url");
const pwHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const sql = ownerSql();
const [existing] = await sql`select id, role from users where email = ${email}`;
if (existing && existing.role !== "super_admin") { console.error("That email belongs to a college administrator."); process.exit(1); }
if (existing && !reset) { console.error("A Super Admin with that email exists. Use --reset for recovery."); process.exit(1); }
if (!existing && reset) { console.error("No Super Admin with that email."); process.exit(1); }

if (existing) {
  await sql`update users set password_hash = ${pwHash}, mfa_enabled = false, mfa_secret_enc = null, mfa_last_counter = null,
              failed_logins = 0, locked_until = null, status = 'active' where id = ${existing.id}`;
  await sql`update sessions set revoked_at = now() where user_id = ${existing.id} and revoked_at is null`;
  await sql`insert into audit_events (actor_label, action, target) values ('owner:cli', 'auth.super_admin_recovered', ${email})`;
} else {
  await sql`insert into users (email, name, role, status, password_hash) values (${email}, ${name}, 'super_admin', 'active', ${pwHash})`;
  await sql`insert into audit_events (actor_label, action, target) values ('owner:cli', 'auth.super_admin_provisioned', ${email})`;
}
console.log(`\n✓ Super Admin ${existing ? "recovered" : "provisioned"}: ${email}`);
console.log(`  Temporary password (shown once): ${password}`);
console.log("  Sign in at /admin/login — you'll be required to set up two-step verification, then change this password from Account.\n");
await sql.end();
