import { readFileSync } from "node:fs";
import { ownerSql } from "./_db";
const pw = process.env.APP_DB_PASSWORD;
if (!pw || pw.length < 16) { console.error("APP_DB_PASSWORD (16+ chars) is required."); process.exit(1); }
const sql = ownerSql();
await sql.begin(async (tx) => {
  await tx`select set_config('vapp.app_password', ${pw}, true)`;
  await tx.unsafe(readFileSync("db/roles.sql", "utf8"));
});
console.log("✓ vapp_app role ready");
await sql.end();
