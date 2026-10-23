export {};
// Local stand-in for Vercel Cron: calls the protected cron endpoints on an interval.
const base = process.env.APP_URL ?? "http://localhost:3000";
const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const once = process.argv.includes("--once");
async function hit(path: string) {
  try { const r = await fetch(base + path, { headers: auth }); console.log(new Date().toISOString(), path, r.status, (await r.text()).slice(0, 200)); }
  catch (e) { console.error(path, (e as Error).message); }
}
await hit("/api/cron/tick"); await hit("/api/cron/retention");
if (!once) { setInterval(() => hit("/api/cron/tick"), 60_000); setInterval(() => hit("/api/cron/retention"), 3600_000); }
