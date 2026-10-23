/**
 * Builds docs/TEST_REPORT.md from the machine-readable results actually produced by the last runs:
 *   test-results/vitest.json (Vitest JSON reporter) and test-results/e2e.json (Playwright JSON reporter).
 * Tests that did not run are reported as NOT RUN — never as passed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

type Row = { suite: string; name: string; status: "PASS" | "FAIL" | "NOT RUN"; ms: number; error?: string; cmd: string };
const rows: Row[] = [];
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").slice(0, 220);
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

if (existsSync("test-results/vitest.json")) {
  const v = JSON.parse(readFileSync("test-results/vitest.json", "utf8"));
  for (const f of v.testResults) {
    const file = f.name.replace(process.cwd() + "/", "");
    for (const a of f.assertionResults) {
      rows.push({
        suite: file.includes("/unit/") ? "Unit" : "Integration",
        name: [...a.ancestorTitles, a.title].join(" › "),
        status: a.status === "passed" ? "PASS" : a.status === "failed" ? "FAIL" : "NOT RUN",
        ms: Math.round(a.duration ?? 0),
        error: a.failureMessages?.length ? strip(a.failureMessages[0]) : undefined,
        cmd: `npx vitest run ${file} -t "${a.title}"`,
      });
    }
  }
}
if (existsSync("test-results/e2e.json")) {
  const e = JSON.parse(readFileSync("test-results/e2e.json", "utf8"));
  const walk = (s: any, path: string[]) => {
    for (const spec of s.specs ?? []) for (const t of spec.tests) {
      const r = t.results.at(-1);
      rows.push({
        suite: spec.file.includes("security") ? "E2E security" : spec.file.includes("responsive") ? "E2E responsive/PWA" : "E2E workflow",
        name: [...path, spec.title].filter(Boolean).join(" › "),
        status: !r || t.status === "skipped" ? "NOT RUN" : r.status === "passed" ? "PASS" : "FAIL",
        ms: r?.duration ?? 0, error: r?.error?.message ? strip(r.error.message) : undefined,
        cmd: `npx playwright test ${spec.file}:${spec.line}`,
      });
    }
    for (const c of s.suites ?? []) walk(c, [...path, c.title.endsWith(".ts") ? "" : c.title]);
  };
  for (const s of e.suites) walk(s, []);
}

const manual: { check: string; expected: string; actual: string; status: string; when: string }[] =
  existsSync("test-results/manual-checks.json") ? JSON.parse(readFileSync("test-results/manual-checks.json", "utf8")) : [];
const count = (st: Row["status"]) => rows.filter((r) => r.status === st).length;
const now = new Date().toISOString();
let md = `# V.app — Test report

Generated ${now} by \`npx tsx scripts/test-report.ts\` from the result files of the most recent runs. Nothing in this table is hand-edited.

| Total | Passed | Failed | Not run |
|---|---|---|---|
| ${rows.length} | ${count("PASS")} | ${count("FAIL")} | ${count("NOT RUN")} |

Environment: Node ${process.version}, PostgreSQL 16 (local), Chromium (Playwright), production build (\`next build\` + \`next start\`) for E2E.

## Defects found during testing and fixed

| # | Defect | Found by | Fix | Status |
|---|---|---|---|---|
| 1 | CSV uploads parsed as empty sheets (Uint8Array passed where SheetJS expected a Buffer) | Unit test *caps rows* / *validates rows* | Convert to Buffer before parsing (\`src/lib/imports.ts\`) | Fixed, re-tested |
| 2 | React 19 auto-reset forms after Server Actions: the chosen file vanished between *Preview* and *Import*, and typed values were lost on validation errors | E2E *malicious spreadsheets* | Forms submit via \`startTransition\` without auto-reset; import buttons build \`FormData\` explicitly | Fixed, re-tested |
| 3 | Publishing hung when the college had administrators: notification insert on a second connection waited on the election row locked by the publish transaction | E2E *publish* step | Queue notifications inside the same transaction; \`FOR NO KEY UPDATE\`; 10 s \`lock_timeout\` on all connections; regression test added | Fixed, re-tested |
| 4 | Development CSP blocked React dev tooling (\`eval\`) | Admin page crawl | \`'unsafe-eval'\` only when \`NODE_ENV !== production\` (E2E asserts it's absent in production) | Fixed |
| 5 | Health page 500: app role lacked read access to \`schema_migrations\` | Console crawl | Migration \`0005\` grants \`SELECT\` | Fixed |

Test-only adjustments (not product defects): the E2E environment raises per-network rate limits (all traffic comes from one IP — the limiter correctly blocked it); the TOTP helper waits for an unused 30-second step (the server correctly rejects replayed codes); an E2E password containing "admin" was correctly rejected by the password policy.

## Results

| Suite | Test (expected outcome) | Actual | Status | Failure explanation | Reproduce | Remediation |
|---|---|---|---|---|---|---|
`;
for (const r of rows) {
  md += `| ${r.suite} | ${esc(r.name)} | ${r.status === "PASS" ? `Behaved as expected (${r.ms} ms)` : r.status === "FAIL" ? "Did not behave as expected" : "Not executed"} | **${r.status}** | ${r.error ? esc(r.error) : "—"} | \`${esc(r.cmd)}\` | ${r.status === "PASS" ? "—" : r.status === "FAIL" ? "Open" : "Not run"} |\n`;
}
md += `
## Manual checks performed in the build environment

| Check | Expected | Actual | Status |
|---|---|---|---|
${manual.map((m) => `| ${m.check} | ${m.expected} | ${m.actual} (${m.when}) | **${m.status}** |`).join("\n")}
| Responsive screenshots | Layouts adapt at 360–1920 px with no horizontal scroll | Asserted automatically in *E2E responsive*; screenshots in \`test-results/screens/\` | see E2E rows |

## Coverage of the mandatory security scenarios (spec §18)

| Scenario | Covered by |
|---|---|
| Unauthorised user → Super Admin dashboard | E2E security: unauthenticated users…; password alone never reaches…; college administrator cannot access the Super Admin console |
| College admin → another college's data | E2E security: …changing URLs or API paths; Integration: tenant isolation (3 tests) |
| Vote without email verification | E2E security: voting requires email verification…; E2E workflow step 8 |
| Unpublished results page | E2E security: unpublished results are not visible… |
| Changing a candidate ID in a request | E2E security: tampered candidate IDs…; Integration: rejects a candidate from another position or election |
| Duplicate and simultaneous submissions | Integration: 50 concurrent submissions…; E2E workflow steps 10–11 |
| Replayed requests | Integration: idempotent replay…; E2E security: …replays… |
| Expired voting sessions | Integration: rejects invalid, expired and revoked sessions; E2E security: …expired sessions |
| Malicious spreadsheet files | E2E security: malicious or disguised spreadsheets…; Unit: rejects disguised and binary files |
| Unauthorised result publication | Integration: cannot modify or create data in another college (\`E.publish\` across colleges); publish refused before close / with open incidents |
| Unauthorised ballot access | Integration: the app role cannot read, write or delete raw ballots |
| Editing an accepted ballot | Integration: accepted ballots are immutable even for the schema owner |
| Unauthorised data deletion | Integration: refuses premature purge…; E2E security: college admin → \`/platform/jobs\` forbidden |
`;
writeFileSync("docs/TEST_REPORT.md", md);
console.log(`docs/TEST_REPORT.md written: ${rows.length} tests, ${count("PASS")} passed, ${count("FAIL")} failed, ${count("NOT RUN")} not run`);
