/**
 * TEST MODE seed — fictional colleges, students and candidates only.
 * Refuses to run unless APP_MODE=test. Safe to re-run (it wipes and recreates demo data).
 */
import { randomBytes, randomUUID, createHash, createCipheriv } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { ownerSql } from "./_db";

if (process.env.APP_MODE !== "test") { console.error("✗ Seeding is only allowed with APP_MODE=test."); process.exit(1); }
const url = process.env.DATABASE_OWNER_URL ?? "";
if (/supabase\.co|neon\.tech|amazonaws|prod/i.test(url) && !process.argv.includes("--i-know-this-is-not-production")) {
  console.error("✗ DATABASE_OWNER_URL looks like a hosted database. Seeding refused."); process.exit(1);
}

export const DEMO = {
  superAdmin: { email: "dev@vapp.test", password: "TestMode-Dev-2026!", totp: "VAPPDEMOSUPERADMINTESTMODE234567" },
  admins: [
    { email: "admin@northfield.test", name: "Anita Varghese", password: "TestMode-Admin-2026!" },
    { email: "admin@riverside.test", name: "Rahul Menon", password: "TestMode-Admin-2026!" },
  ],
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function encrypt(plain: string) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
const H = 3600_000, D = 24 * H;
const ref = () => "E-" + randomBytes(5).toString("hex").toUpperCase();

const sql = ownerSql();
await sql.begin(async (tx) => {
  // Wipe demo tenants (cascades through elections). Ballot purge flag lets cascades through immutability triggers.
  await tx`select set_config('ballot.purging', 'on', true)`;
  await tx`delete from elections where college_id in (select id from colleges where code like '%-DEMO')`;
  await tx`delete from colleges where code like '%-DEMO'`;
  await tx`delete from users where email like '%.test'`;
  await tx`delete from dev_mailbox`; await tx`delete from rate_limits`;
});

const pw = (p: string) => hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const [sa] = await sql`insert into users (email, name, role, status, password_hash, mfa_enabled, mfa_secret_enc)
  values (${DEMO.superAdmin.email}, 'Demo Developer', 'super_admin', 'active', ${await pw(DEMO.superAdmin.password)}, true, ${encrypt(DEMO.superAdmin.totp)}) returning id`;

const [nf] = await sql`insert into colleges (code, name, short_name, city, email_domains, default_retention_days)
  values ('NIT-DEMO', 'Northfield Institute of Technology', 'Northfield', 'Thiruvananthapuram', ${["northfield.test"]}, 30) returning id`;
const [rv] = await sql`insert into colleges (code, name, short_name, city, email_domains, default_retention_days)
  values ('RCAS-DEMO', 'Riverside College of Arts & Science', 'Riverside', 'Kochi', ${["riverside.test"]}, 14) returning id`;
const adminIds: string[] = [];
for (const [i, a] of DEMO.admins.entries()) {
  const [u] = await sql`insert into users (email, name, role, status, password_hash) values (${a.email}, ${a.name}, 'college_admin', 'active', ${await pw(a.password)}) returning id`;
  await sql`insert into college_admins (user_id, college_id, created_by) values (${u.id}, ${i === 0 ? nf.id : rv.id}, ${sa.id})`;
  adminIds.push(u.id);
}

type Pos = { name: string; seats?: number; groups?: string[]; cands: [string, string, string][] };
async function election(o: { college: string; slug: string; title: string; event: string; start: number; end: number; status: string; positions: Pos[];
  voters: number; domain: string; abstain?: boolean; by: string; approval?: boolean }) {
  const [e] = await sql`insert into elections (college_id, slug, public_ref, event_name, title, description, academic_year, starts_at, ends_at, status,
      allow_abstain, results_require_approval, allow_unpublish, created_by, activated_at, activated_by)
    values (${o.college}, ${o.slug}, ${ref()}, ${o.event}, ${o.title},
      ${"Elect your representatives for the 2026–27 academic year. This is FICTIONAL test data generated for V.app test mode."},
      '2026–27', ${new Date(Date.now() + o.start)}, ${new Date(Date.now() + o.end)}, ${o.status === "results_pending" ? "open" : o.status},
      ${o.abstain ?? true}, ${o.approval ?? true}, true, ${o.by}, ${o.status === "draft" ? null : new Date()}, ${o.status === "draft" ? null : o.by}) returning id`;
  const pos: { id: string; cands: string[] }[] = [];
  for (const [i, p] of o.positions.entries()) {
    const [pr] = await sql`insert into positions (election_id, college_id, name, sort_order, max_selections, eligible_groups)
      values (${e.id}, ${o.college}, ${p.name}, ${i + 1}, ${p.seats ?? 1}, ${p.groups ?? null}) returning id`;
    const cids: string[] = [];
    for (const [j, [name, dept, intro]] of p.cands.entries()) {
      const [c] = await sql`insert into candidates (position_id, election_id, college_id, full_name, department, year_label, intro, manifesto, symbol, sort_order)
        values (${pr.id}, ${e.id}, ${o.college}, ${name}, ${dept}, ${["2nd year", "3rd year", "4th year"][j % 3]}, ${intro},
                ${`${intro} If elected I will publish monthly updates, hold open office hours every week, and keep the union budget public. (Fictional manifesto for testing.)`},
                ${["Star", "Book", "Lamp", "Tree"][j % 4]}, ${j + 1}) returning id`;
      cids.push(c.id);
    }
    pos.push({ id: pr.id, cands: cids });
  }
  const groups = ["CSE", "ECE", "ME"];
  const rows = Array.from({ length: o.voters }, (_, i) => ({
    election_id: e.id, college_id: o.college, email: `student${String(i + 1).padStart(3, "0")}@${o.domain}`,
    name: `Test Student ${i + 1}`, student_id: `T${String(i + 1).padStart(4, "0")}`, voter_group: groups[i % 3],
  }));
  if (rows.length) await sql`insert into voters ${sql(rows)}`;
  await sql`insert into audit_events (actor_label, college_id, election_id, action, target) values ('seed:test-mode', ${o.college}, ${e.id}, 'election.seeded', ${o.title})`;
  return { id: e.id as string, pos };
}

/** Casts votes through the real ballot.cast_votes() function, exactly like the app does. */
async function castFor(electionId: string, voterIdx: number[], choose: (v: number, p: number, cands: string[]) => string[], pos: { id: string; cands: string[] }[], groupsOf?: (p: number) => string[] | null) {
  for (const v of voterIdx) {
    const [voter] = await sql`select id, voter_group from voters where election_id = ${electionId} and student_id = ${`T${String(v).padStart(4, "0")}`}`;
    const token = randomBytes(24).toString("base64url");
    await sql`insert into voter_sessions (token_hash, voter_id, election_id, expires_at) values (${sha(token)}, ${voter.id}, ${electionId}, now() + interval '5 minutes')`;
    const choices = pos.map((p, i) => ({ p, i })).filter(({ i }) => { const g = groupsOf?.(i); return !g || g.includes(voter.voter_group); })
      .map(({ p, i }) => ({ position_id: p.id, candidate_ids: choose(v, i, p.cands) }));
    await sql`select ballot.cast_votes(${sha(token)}, ${randomUUID()}, ${sql.json(choices)})`;
  }
}

const union = await election({
  college: nf.id, slug: "northfield-union-2026", title: "College Union Election 2026", event: "Northfield College Union Election", by: adminIds[0],
  start: -1 * H, end: 3 * D, status: "open", voters: 60, domain: "northfield.test",
  positions: [
    { name: "Chairperson", cands: [["Aditya Nair", "Computer Science", "Third-year CSE, ran the coding club."], ["Meera Krishnan", "Electronics", "ECE rep for two years."], ["Farhan Ali", "Mechanical", "Captain of the robotics team."]] },
    { name: "Vice Chairperson", cands: [["Sneha Pillai", "Computer Science", "Organised the 2025 tech fest."], ["Joel Thomas", "Mechanical", "Hostel committee member."]] },
    { name: "General Secretary", cands: [["Arjun Das", "Electronics", "Debate society president."], ["Lakshmi Iyer", "Computer Science", "Student newsletter editor."], ["Nikhil Raj", "Mechanical", "NSS volunteer lead."], ["Divya S", "Electronics", "Women in Engineering chapter lead."]] },
    { name: "Treasurer", cands: [["Rohan Mathew", "Computer Science", "Managed the club budget for two years."], ["Ananya Menon", "Electronics", "Finance club coordinator."], ["Vishnu Prasad", "Mechanical", "Canteen committee member."]] },
  ],
});
// 12 students (031–042) have already voted so live results have data. Students 001–030 are untouched for your own testing.
await castFor(union.id, Array.from({ length: 12 }, (_, i) => 31 + i), (v, p, c) => [c[(v + p) % c.length]], union.pos);

const sports = await election({
  college: nf.id, slug: "northfield-sports-council-2026", title: "Sports Council Election 2026", event: "Northfield Sports Council", by: adminIds[0],
  start: -2 * D, end: 1 * H, status: "results_pending", voters: 24, domain: "northfield.test",
  positions: [
    { name: "Sports Secretary", cands: [["Kiran Babu", "Mechanical", "State-level football player."], ["Amal Joseph", "Computer Science", "Organised the inter-college cricket league."], ["Riya Thomas", "Electronics", "Athletics team captain."]] },
    { name: "Arts Club Secretary", cands: [["Gauri Nair", "Electronics", "Classical dancer, led the 2025 arts fest."], ["Sanjay Kumar", "Computer Science", "Theatre club founder."]] },
  ],
});
// Deterministic outcome: Sports Secretary has a clear winner; Arts Club Secretary is an exact tie (demonstrates tie handling).
await castFor(sports.id, Array.from({ length: 20 }, (_, i) => i + 1), (v, p, c) => p === 0 ? [c[v <= 9 ? 0 : v <= 15 ? 1 : 2]] : [c[v % 2]], sports.pos);
await sql`update elections set ends_at = now() - interval '1 minute', closed_at = now() - interval '1 minute', status = 'results_pending' where id = ${sports.id}`;

await election({
  college: nf.id, slug: "northfield-arts-club-2026", title: "Arts Club Elections 2026", event: "Northfield Arts Club", by: adminIds[0],
  start: 5 * D, end: 6 * D, status: "draft", voters: 0, domain: "northfield.test",
  positions: [{ name: "Arts Club President", cands: [["Neha George", "Computer Science", "Painter and muralist."]] }],
});

await election({
  college: rv.id, slug: "riverside-students-council-2026", title: "Students' Council 2026", event: "Riverside Students' Council", by: adminIds[1],
  start: 2 * D, end: 3 * D, status: "scheduled", voters: 30, domain: "riverside.test",
  positions: [
    { name: "Chairperson", cands: [["Fathima Rasheed", "English", "Literary club secretary."], ["Abhinav S", "Commerce", "Commerce association lead."]] },
    { name: "Magazine Editor", cands: [["Irene Paul", "English", "Edits the campus blog."], ["Hari Krishnan", "History", "Runs the history podcast."]] },
  ],
});

await sql`insert into audit_events (actor_label, action, target) values ('seed:test-mode', 'seed.completed', 'fictional demo data')`;
console.log(`
✓ TEST MODE demo data created (all fictional).

  Super Admin      ${DEMO.superAdmin.email} / ${DEMO.superAdmin.password}
                   TOTP secret ${DEMO.superAdmin.totp}  →  current code: npx tsx scripts/totp.ts ${DEMO.superAdmin.totp}
  College admins   ${DEMO.admins.map((a) => a.email).join(", ")} / ${DEMO.admins[0].password}
  Open election    /e/northfield-union-2026   voters student001…student060@northfield.test (001–030 haven't voted)
  Results pending  Sports Council Election 2026 (has a tie)
  Voter codes      /dev/inbox (test mode only)
`);
await sql.end();
