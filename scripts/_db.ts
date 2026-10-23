import postgres from "postgres";
export function ownerSql() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is required for this script (schema owner connection).");
  return postgres(url, { max: 1, onnotice: () => {} });
}
