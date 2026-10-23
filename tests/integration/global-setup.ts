import postgres from "postgres";
import { execSync } from "node:child_process";

/** Recreates the disposable test database from migrations before the suite runs. */
export default async function setup() {
  await import("../setup-env");
  const name = process.env.TEST_DB_NAME!;
  if (!/test/.test(name)) throw new Error("Refusing to reset a database whose name doesn't contain 'test'");
  const admin = postgres(process.env.DATABASE_OWNER_URL!.replace(`/${name}`, "/postgres"), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const env = { ...process.env };
  execSync("npx tsx scripts/setup-roles.ts && npx tsx scripts/migrate.ts", { env, stdio: "pipe" });
}
