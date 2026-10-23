import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ownerSql } from "./_db";

const sql = ownerSql();
await sql`create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
const applied = new Map((await sql`select name, checksum from schema_migrations`).map((r) => [r.name as string, r.checksum as string]));
const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();
let n = 0;
for (const f of files) {
  const body = readFileSync(`db/migrations/${f}`, "utf8");
  const sum = createHash("sha256").update(body).digest("hex");
  if (applied.has(f)) {
    if (applied.get(f) !== sum) { console.error(`✗ ${f} was modified after being applied. Create a new migration instead.`); process.exit(1); }
    continue;
  }
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (name, checksum) values (${f}, ${sum})`;
  });
  console.log(`✓ applied ${f}`); n++;
}
console.log(n ? `${n} migration(s) applied.` : "Database is up to date.");
await sql.end();
