import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { makeElection, session, cast, ownerDb, appDb, closeDbs, tally } from "./helpers";
import * as E from "@/lib/elections";
import { retentionRun, lifecycleTick } from "@/lib/jobs";
import { withCtx, sql, type Ctx } from "@/lib/db";
import { audit } from "@/lib/audit";

const actor = { id: "00000000-0000-0000-0000-000000000000", label: "test-admin" };
let adminUser: string;
beforeAll(async () => {
  const [u] = await ownerDb()`insert into users (email, name, role, status) values ('admin@int.test', 'Int Admin', 'college_admin', 'active') on conflict (email) do update set name = excluded.name returning id`;
  adminUser = u.id; actor.id = u.id;
});
afterAll(async () => { await sql().end(); await closeDbs(); });
const ctxFor = (...collegeIds: string[]): Ctx => ({ role: "college_admin", userId: adminUser, collegeIds });

describe("least-privilege database role", () => {
  it("the app role cannot read, write or delete raw ballots", async () => {
    const f = await makeElection();
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    await expect(appDb()`select * from ballot.selections`).rejects.toThrow(/permission denied/);
    await expect(appDb()`insert into ballot.selections (election_id, position_id) values (${f.electionId}, ${f.positions[0].id})`).rejects.toThrow(/permission denied/);
    await expect(appDb()`insert into participations (election_id, college_id, position_id, voter_id, submission_id) values (${f.electionId}, ${f.collegeId}, ${f.positions[0].id}, ${f.voters[1]}, gen_random_uuid())`).rejects.toThrow(/permission denied/);
    await expect(appDb()`delete from participations`).rejects.toThrow(/permission denied/);
    await expect(appDb()`update audit_events set action = 'x'`).rejects.toThrow(/permission denied/);
  });
  it("accepted ballots are immutable even for the schema owner", async () => {
    const f = await makeElection();
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    await expect(ownerDb()`update ballot.selections set candidate_id = ${f.positions[0].cands[1]} where election_id = ${f.electionId}`).rejects.toThrow(/immutable/);
    await expect(ownerDb()`delete from participations where election_id = ${f.electionId}`).rejects.toThrow(/immutable/);
  });
  it("the app role cannot create or escalate to Super Admin", async () => {
    await expect(appDb()`insert into users (email, name, role) values ('evil@x.test', 'Evil', 'super_admin')`).rejects.toThrow(/platform owner/);
    await expect(appDb()`update users set role = 'super_admin' where id = ${adminUser}`).rejects.toThrow(/platform owner/);
  });
});

describe("tenant isolation (Row Level Security)", () => {
  it("a college admin sees only their own college's data", async () => {
    const a = await makeElection(); const b = await makeElection();
    const seen = await withCtx(ctxFor(a.collegeId), async (tx) => ({
      elections: await tx`select id from elections`, voters: await tx`select id from voters`, positions: await tx`select id from positions`,
      candidates: await tx`select id from candidates`, colleges: await tx`select id from colleges`,
    }));
    expect(seen.elections.map((r) => r.id)).toEqual([a.electionId]);
    expect(seen.colleges.map((r) => r.id)).toEqual([a.collegeId]);
    expect(seen.voters.length).toBe(a.voters.length);
    expect(seen.positions.length).toBe(a.positions.length);
    expect(await E.getElection(ctxFor(a.collegeId), b.electionId)).toBeNull();
  });
  it("cannot modify or create data in another college", async () => {
    const a = await makeElection(); const b = await makeElection({ status: "draft" });
    const r = await withCtx(ctxFor(a.collegeId), (tx) => tx`update elections set title = 'hacked' where id = ${b.electionId}`);
    expect(r.count).toBe(0);
    await expect(withCtx(ctxFor(a.collegeId), (tx) => tx`insert into voters (election_id, college_id, email) values (${b.electionId}, ${b.collegeId}, 'x@t.test')`)).rejects.toThrow(/row-level security/);
    await expect(E.upsertPosition(ctxFor(a.collegeId), actor, b.electionId, null, { name: "Hack", max_selections: 1, eligible_groups: null })).rejects.toThrow(/not found|access/i);
    await expect(E.publish(ctxFor(a.collegeId), actor, b.electionId)).rejects.toThrow(/not found|access/i);
  });
  it("no context means no rows", async () => {
    await makeElection();
    expect(await appDb()`select id from elections`).toHaveLength(0);
    expect(await appDb()`select id from voters`).toHaveLength(0);
  });
});

describe("election management rules", () => {
  it("structure is locked after activation and activation requires readiness", async () => {
    const f = await makeElection({ status: "draft", startH: 1, endH: 6, voters: 0 });
    const ctx = ctxFor(f.collegeId);
    await expect(E.activate(ctx, actor, f.electionId)).rejects.toThrow(/Import at least one eligible voter/);
    await expect(E.addVoter(ctx, actor, f.electionId, "noid@t.test", null, null, null)).rejects.toThrow(/student's ID/);
    await E.addVoter(ctx, actor, f.electionId, "new@t.test", null, " new 01 ", null);
    expect((await ownerDb()`select student_id from voters where email = 'new@t.test' and election_id = ${f.electionId}`)[0].student_id).toBe("NEW01");
    await expect(E.addVoter(ctx, actor, f.electionId, "other@t.test", null, "NEW01", null)).rejects.toThrow(/already on the voter list/);
    await E.activate(ctx, actor, f.electionId);
    await expect(E.upsertPosition(ctx, actor, f.electionId, null, { name: "Late", max_selections: 1, eligible_groups: null })).rejects.toThrow(/activated/);
    await expect(E.deleteCandidate(ctx, actor, f.electionId, f.positions[0].cands[0])).rejects.toThrow(/activated/);
    await E.returnToDraft(ctx, actor, f.electionId);
    expect((await E.getElection(ctx, f.electionId))?.status).toBe("draft");
  });
  it("pause revokes voter sessions and blocks voting; resume allows only extension", async () => {
    const f = await makeElection({ status: "open" });
    const ctx = ctxFor(f.collegeId);
    const s = await session(f, 0);
    await expect(E.pause(ctx, actor, f.electionId, "short")).rejects.toThrow(/10 characters/);
    await E.pause(ctx, actor, f.electionId, "Candidate details were wrong");
    const [{ n }] = await ownerDb()`select count(*)::int as n from voter_sessions where election_id = ${f.electionId} and revoked_at is null`;
    expect(n).toBe(0);
    await expect(cast(s, [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }])).rejects.toThrow(/SESSION_INVALID/);
    await expect(E.resume(ctx, actor, f.electionId, new Date(Date.now() + 60_000))).rejects.toThrow(/extended but not brought forward/);
    await E.resume(ctx, actor, f.electionId, new Date(Date.now() + 10 * 3600_000));
    expect((await E.getElection(ctx, f.electionId))?.effective).toBe("open");
  });
  it("candidate withdrawal only while paused, with a reason", async () => {
    const f = await makeElection({ status: "open" });
    const ctx = ctxFor(f.collegeId);
    await expect(E.setCandidateStatus(ctx, actor, f.electionId, f.positions[0].cands[0], "withdrawn", "Withdrew from the race")).rejects.toThrow(/Pause/);
    await E.pause(ctx, actor, f.electionId, "Candidate withdrawal amendment");
    await E.setCandidateStatus(ctx, actor, f.electionId, f.positions[0].cands[0], "withdrawn", "Withdrew from the race");
  });
});

describe("results, integrity and publication", () => {
  it("publishes only after close, with passing integrity, and results match accepted ballots", async () => {
    const f = await makeElection({ voters: 6 });
    const ctx = ctxFor(f.collegeId);
    const [chair, vice] = f.positions;
    const picks = [0, 0, 1, 0, 2];
    for (let i = 0; i < picks.length; i++) await cast(await session(f, i), [{ position_id: chair.id, candidate_ids: [chair.cands[picks[i]]] }, { position_id: vice.id, candidate_ids: [vice.cands[i % 2]] }]);
    await cast(await session(f, 0), [{ position_id: chair.id, candidate_ids: [chair.cands[2]] }]); // duplicate attempt ignored
    await expect(E.publish(ctx, actor, f.electionId)).rejects.toThrow(/after the election has closed/);
    await E.closeNow(ctx, actor, f.electionId, "Voting window finished early");
    await E.flagIncident(ctx, actor, f.electionId, "Student reported a phishing email");
    await expect(E.publish(ctx, actor, f.electionId)).rejects.toThrow(/Integrity/);
    const [inc] = await ownerDb()`select id from security_events where election_id = ${f.electionId} and requires_review`;
    await E.resolveIncident(ctx, actor, inc.id, "Checked: phishing email was unrelated, no votes affected");
    const snap = await E.publish(ctx, actor, f.electionId);
    const [s] = await ownerDb()`select data from result_snapshots where id = ${snap}`;
    const chairRes = s.data.results.positions.find((p: { name: string }) => p.name === "Chairman");
    expect(chairRes.participants).toBe(5);
    expect(chairRes.candidates.map((c: { votes: number }) => c.votes)).toEqual([3, 1, 1]);
    expect(chairRes.candidates[0]).toMatchObject({ outcome: "winner", pct: 60 });
    expect(s.data.results.turnoutPct).toBe(83.33);
    const t = await tally(f.electionId);
    expect(t.filter((x) => x.position_id === chair.id).reduce((a, x) => a + x.votes, 0)).toBe(5);
    await expect(ownerDb()`update result_snapshots set data = '{}' where id = ${snap}`).rejects.toThrow(/append-only/);
    const [e] = await ownerDb()`select status, purge_after, published_at from elections where id = ${f.electionId}`;
    expect(e.status).toBe("published");
    expect(new Date(e.purge_after).getTime() - new Date(e.published_at).getTime()).toBe(30 * 86_400_000);
  });
  it("publishing notifies assigned administrators without lock contention (regression)", async () => {
    const f = await makeElection({ voters: 2 });
    await ownerDb()`insert into college_admins (user_id, college_id) values (${adminUser}, ${f.collegeId})`;
    const ctx = ctxFor(f.collegeId);
    await E.closeNow(ctx, actor, f.electionId, "End of voting for regression test");
    const t0 = Date.now();
    await E.publish(ctx, actor, f.electionId);
    expect(Date.now() - t0).toBeLessThan(5000);
    const n = await ownerDb()`select to_email from notifications where election_id = ${f.electionId} and kind = 'results_published'`;
    expect(n.map((r) => r.to_email)).toEqual(["admin@int.test"]);
  });
  it("reports ties without breaking them", async () => {
    const f = await makeElection({ voters: 4, positions: [{ name: "Chair", cands: 2 }] });
    for (let i = 0; i < 4; i++) await cast(await session(f, i), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[i % 2]] }]);
    const r = await withCtx(ctxFor(f.collegeId), (tx) => E.computeElection(f.electionId, tx));
    expect(r.positions[0].status).toBe("tie");
    expect(r.positions[0].candidates.every((c) => c.outcome === "tied")).toBe(true);
  });
  it("audit chain verifies, and tampering is detected", async () => {
    await audit({ actorLabel: "test", action: "test.one" });
    await audit({ actorLabel: "test", action: "test.two", details: { password: "secret", ok: 1 } });
    const [ok] = await ownerDb()`select * from app.verify_audit_chain()`;
    expect(ok.ok).toBe(true);
    const [last] = await ownerDb()`select details from audit_events order by id desc limit 1`;
    expect(last.details.password).toBe("[redacted]");
    // Simulate an attacker with owner rights who disables the guard and edits history.
    await ownerDb().begin(async (tx) => {
      await tx`alter table audit_events disable trigger audit_events_immutable`;
      await tx`update audit_events set target = 'tampered' where id = (select min(id) from audit_events)`;
      await tx`alter table audit_events enable trigger audit_events_immutable`;
      const [bad] = await tx`select * from app.verify_audit_chain()`;
      expect(bad.ok).toBe(false);
      throw new Error("rollback");
    }).catch((e) => { if (e.message !== "rollback") throw e; });
  });
});

describe("Super Admin full election access", () => {
  it("super-admin context can read and manage any college's election", async () => {
    const a = await makeElection(); const b = await makeElection();
    const sup: Ctx = { role: "super_admin", userId: adminUser };
    expect((await E.getElection(sup, a.electionId))?.id).toBe(a.electionId);
    expect((await E.getElection(sup, b.electionId))?.id).toBe(b.electionId);
    await E.pause(sup, actor, a.electionId, "Super admin emergency pause");
    expect((await E.getElection(sup, a.electionId))?.status).toBe("paused");
  });
  it("delete_election removes an election with accepted ballots, and nothing is left behind", async () => {
    const f = await makeElection({ voters: 3 });
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    const [r] = await appDb()`select ballot.delete_election(${f.electionId}) as c`;
    expect(r.c.ballot_selections).toBe(1);
    expect(r.c.voters).toBe(3);
    for (const t of ["voters", "positions", "candidates", "participations", "vote_submissions", "voter_sessions"]) {
      const [{ n }] = await ownerDb().unsafe(`select count(*)::int as n from ${t} where election_id = $1`, [f.electionId]);
      expect(n, t).toBe(0);
    }
    const [{ n: sel }] = await ownerDb()`select count(*)::int as n from ballot.selections where election_id = ${f.electionId}`;
    expect(sel).toBe(0);
    expect(await ownerDb()`select id from elections where id = ${f.electionId}`).toHaveLength(0);
    // Outside this function, ballots stay immutable.
    const g = await makeElection();
    await cast(await session(g, 0), [{ position_id: g.positions[0].id, candidate_ids: [g.positions[0].cands[0]] }]);
    await expect(ownerDb()`delete from ballot.selections where election_id = ${g.electionId}`).rejects.toThrow(/immutable/);
  });
});

describe("Super Admin college and administrator management", () => {
  it("delete_college removes the college, its elections and ballots, keeps admin accounts and the audit log", async () => {
    const f = await makeElection({ voters: 2 });
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    const [u] = await ownerDb()`insert into users (email, name, role, status) values (${`del-${f.electionId.slice(0, 8)}@t.test`}, 'Del Admin', 'college_admin', 'active') returning id`;
    await ownerDb()`insert into college_admins (user_id, college_id) values (${u.id}, ${f.collegeId})`;
    const [{ n: auditBefore }] = await ownerDb()`select count(*)::int as n from audit_events`;
    const [r] = await appDb()`select ballot.delete_college(${f.collegeId}) as c`;
    expect(r.c.elections).toHaveLength(1);
    expect(r.c.admin_assignments).toBe(1);
    expect(await ownerDb()`select id from colleges where id = ${f.collegeId}`).toHaveLength(0);
    expect(await ownerDb()`select id from elections where id = ${f.electionId}`).toHaveLength(0);
    expect(await ownerDb()`select id from ballot.selections where election_id = ${f.electionId}`).toHaveLength(0);
    expect(await ownerDb()`select 1 from college_admins where college_id = ${f.collegeId}`).toHaveLength(0);
    expect(await ownerDb()`select id from users where id = ${u.id}`).toHaveLength(1);
    const [{ n: auditAfter }] = await ownerDb()`select count(*)::int as n from audit_events`;
    expect(auditAfter).toBeGreaterThanOrEqual(auditBefore);
  });
  it("only a Super Admin context can see and delete administrator accounts across colleges", async () => {
    const f = await makeElection();
    const [u] = await ownerDb()`insert into users (email, name, role, status) values (${`rm-${f.electionId.slice(0, 8)}@t.test`}, 'Remove Me', 'college_admin', 'active') returning id`;
    await ownerDb()`insert into college_admins (user_id, college_id) values (${u.id}, ${f.collegeId})`;
    const sup: Ctx = { role: "super_admin", userId: actor.id };
    await withCtx(sup, (tx) => tx`update users set name = 'Renamed', email = ${`renamed-${f.electionId.slice(0, 8)}@t.test`} where id = ${u.id}`);
    expect((await ownerDb()`select name from users where id = ${u.id}`)[0].name).toBe("Renamed");
    await withCtx(sup, (tx) => tx`delete from users where id = ${u.id} and role = 'college_admin'`);
    expect(await ownerDb()`select id from users where id = ${u.id}`).toHaveLength(0);
    expect(await ownerDb()`select 1 from college_admins where user_id = ${u.id}`).toHaveLength(0);
  });
});

describe("retention and deletion lifecycle", () => {
  it("refuses premature purge, then deletes personal data and keeps the public aggregate", async () => {
    const f = await makeElection({ voters: 3, retentionDays: 1, keepPublic: true });
    const ctx = ctxFor(f.collegeId);
    await cast(await session(f, 0), [{ position_id: f.positions[0].id, candidate_ids: [f.positions[0].cands[0]] }]);
    await E.closeNow(ctx, actor, f.electionId, "End of voting for test");
    await E.publish(ctx, actor, f.electionId);
    await expect(appDb()`select ballot.purge_election(${f.electionId})`).rejects.toThrow(/NOT_IN_RETENTION/);
    await ownerDb()`update elections set status = 'retention' where id = ${f.electionId}`;
    await expect(appDb()`select ballot.purge_election(${f.electionId})`).rejects.toThrow(/RETENTION_NOT_EXPIRED/);
    // Time travel: make the retention period expire.
    await ownerDb()`update elections set purge_after = now() - interval '1 minute' where id = ${f.electionId}`;
    await ownerDb()`update cleanup_jobs set run_after = now() - interval '1 minute' where election_id = ${f.electionId}`;
    const out = await retentionRun();
    expect(out.purged).toBeGreaterThanOrEqual(1);
    const [left] = await ownerDb()`select ballot.purge_leftovers(${f.electionId}) as l`;
    expect(Object.values(left.l).every((v) => Number(v) === 0)).toBe(true);
    const [e] = await ownerDb()`select status from elections where id = ${f.electionId}`;
    expect(e.status).toBe("deleted");
    expect(await ownerDb()`select id from result_snapshots where election_id = ${f.electionId}`).toHaveLength(1);
    const [rcpt] = await ownerDb()`select * from deletion_receipts where election_id = ${f.electionId}`;
    expect(rcpt.verified).toBe(true);
    expect(rcpt.counts.voters).toBe(3);
    // Idempotent: a second run does nothing harmful.
    const again = await retentionRun({ onlyElectionId: f.electionId });
    expect(again.failed).toBe(0);
  });
  it("removes the snapshot too when the policy doesn't keep public results", async () => {
    const f = await makeElection({ voters: 2, keepPublic: false });
    const ctx = ctxFor(f.collegeId);
    await E.closeNow(ctx, actor, f.electionId, "End of voting for test");
    await E.publish(ctx, actor, f.electionId);
    await retentionRun({ onlyElectionId: f.electionId, force: true });
    expect(await ownerDb()`select id from result_snapshots where election_id = ${f.electionId}`).toHaveLength(0);
    expect((await ownerDb()`select status from elections where id = ${f.electionId}`)[0].status).toBe("deleted");
  });
  it("lifecycle tick opens, closes and auto-publishes when approval isn't required", async () => {
    const f = await makeElection({ status: "scheduled", startH: -1, endH: 2 });
    await lifecycleTick();
    expect((await ownerDb()`select status from elections where id = ${f.electionId}`)[0].status).toBe("open");
    await ownerDb()`update elections set ends_at = now() - interval '1 second', results_require_approval = false where id = ${f.electionId}`;
    await lifecycleTick();
    expect((await ownerDb()`select status from elections where id = ${f.electionId}`)[0].status).toBe("published");
  });
});
