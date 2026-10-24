import { test, expect } from "@playwright/test";
import { loginAdmin, verifyVoter, latestCode, CRON, SUPER } from "./helpers";

/** Mandatory security tests (section 18) executed against the production build with seeded fictional data. */
const NF = "admin@northfield.test", RV = "admin@riverside.test", PW = "TestMode-Admin-2026!";
const SLUG = "northfield-union-2026";

test("unauthenticated users cannot reach the Super Admin console or college dashboards", async ({ page }) => {
  for (const p of ["/platform", "/platform/config", "/college", "/account"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
});

test("a password alone never reaches the Super Admin console (MFA enforced)", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill("#email", SUPER.email); await page.fill("#password", SUPER.password);
  await page.click("button[type=submit]"); await page.waitForURL(/\/admin\/mfa/);
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await page.fill("#code", "000000"); await page.click("button[type=submit]");
  await expect(page.getByText(/didn't match/)).toBeVisible();
});

test("a college administrator cannot access the Super Admin console", async ({ page }) => {
  await loginAdmin(page, NF, PW);
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/platform/jobs");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("a college administrator cannot access another college by changing URLs or API paths", async ({ page, request }) => {
  await loginAdmin(page, NF, PW);
  const nfPath = new URL(page.url()).pathname.replace(/\/$/, "");
  await page.goto(nfPath + "/elections");
  const nfElection = (await page.locator("a[href*='/elections/']").filter({ hasText: "College Union Election 2026" }).first().getAttribute("href"))!;
  const eid = nfElection.split("/elections/")[1];
  await page.context().clearCookies();

  await loginAdmin(page, RV, PW);
  const rvPath = new URL(page.url()).pathname.replace(/\/$/, "");
  await page.goto(nfPath);                                   // other college's dashboard
  await expect(page).toHaveURL(/\/forbidden/);
  const r1 = await page.goto(`${rvPath}/elections/${eid}`);  // other college's election under own college path
  expect(r1!.status()).toBe(404);
  const r2 = await page.goto(`${rvPath}/elections/${eid}/voters`);
  expect(r2!.status()).toBe(404);
  const cookies = await page.context().cookies();
  const r3 = await request.get(`/api/exports/${eid}/report.xlsx`, { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(r3.status()).toBe(404);
  const r4 = await request.get(`/api/exports/${eid}/participation.csv`);
  expect(r4.status()).toBe(401);
});

test("voting requires email verification; submissions without a session are refused", async ({ page, request }) => {
  await page.goto(`/e/${SLUG}/ballot`);
  await expect(page).toHaveURL(new RegExp(`/e/${SLUG}/verify`));
  const r = await request.post(`/e/${SLUG}/submit`, { headers: { Origin: "http://localhost:3100" }, data: { idempotencyKey: "x".repeat(20), choices: [{ position_id: "00000000-0000-0000-0000-000000000000", candidate_ids: [] }] } });
  expect(r.status()).toBe(401);
  // Knowing only the email is not enough: a wrong student ID is rejected with a neutral message.
  await page.fill("#email", "student002@northfield.test"); await page.fill("#student_id", "T9999");
  await page.click("button:has-text('Continue')");
  await expect(page.getByText(/couldn't verify those details/)).toBeVisible();
});

test("knowing a student's email and ID is not enough: the emailed code is required", async ({ page }) => {
  await page.goto(`/e/${SLUG}/verify`);
  await page.fill("#email", "student005@northfield.test"); await page.fill("#student_id", "T0005");
  await page.click("button:has-text('Continue')");
  await expect(page.getByText(/emailed a 6-digit code to st•+@northfield\.test/)).toBeVisible();
  // Wrong codes are refused; the fifth wrong code cancels it.
  for (let i = 0; i < 4; i++) {
    await page.fill("#code", "000000");
    await page.click("button:has-text('Verify and open ballot')");
    await expect(page.getByText(/That code isn't right/)).toBeVisible();
  }
  await page.fill("#code", "000000");
  await page.click("button:has-text('Verify and open ballot')");
  await expect(page.getByText(/Too many wrong codes/)).toBeVisible();
  // Even the real (now cancelled) code no longer works.
  const real = await latestCode("student005@northfield.test", new Date(Date.now() - 120_000));
  await page.fill("#code", real);
  await page.click("button:has-text('Verify and open ballot')");
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/e/${SLUG}/verify`));
});

test("guessing student IDs is locked out per email", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.goto(`/e/${SLUG}/verify`);
    await page.fill("#email", "student004@northfield.test"); await page.fill("#student_id", `GUESS${i}`);
    await page.click("button:has-text('Continue')");
    await expect(page.getByText(/couldn't verify those details/)).toBeVisible();
  }
  // Even the correct ID is now refused for this email until the window passes.
  await page.goto(`/e/${SLUG}/verify`);
  await page.fill("#email", "student004@northfield.test"); await page.fill("#student_id", "T0004");
  await page.click("button:has-text('Continue')");
  await expect(page.getByText(/Too many attempts for this email/)).toBeVisible();

  // An administrator can see the lockout and unlock the student after checking their identity.
  const admin = await page.context().browser()!.newPage();
  await loginAdmin(admin, NF, PW);
  const url = new URL(admin.url()).pathname; // /college/<cid>
  await admin.goto(`${url}/elections`);
  await admin.getByRole("link", { name: "College Union Election 2026" }).first().click();
  await admin.goto(admin.url().replace(/\/?$/, "") + "/voters?q=student004");
  const row = admin.locator("tr", { hasText: "student004@northfield.test" });
  await expect(row.getByText("Locked out")).toBeVisible();
  await row.getByRole("button", { name: "Unlock" }).click();
  await admin.locator("dialog[open]").getByRole("button", { name: "Unlock" }).click();
  await expect(admin.getByText(/can try again now/)).toBeVisible();
  await admin.reload();
  await expect(admin.locator("tr", { hasText: "student004@northfield.test" }).getByText("Locked out")).toHaveCount(0);
  await admin.close();
  await verifyVoter(page, page.context(), SLUG, "student004@northfield.test");
});

test("tampered candidate IDs, cross-origin posts, replays and expired sessions", async ({ page, context }) => {
  await verifyVoter(page, context, SLUG, "student003@northfield.test");
  const ballot = await page.evaluate(() => document.body.innerHTML.length);
  expect(ballot).toBeGreaterThan(0);
  // Grab real position/candidate IDs from the rendered radio inputs.
  const radios = await page.locator("input[type=radio]").evaluateAll((els) => els.map((e) => ({ name: (e as HTMLInputElement).name, value: (e as HTMLInputElement).value })));
  const positionId = radios[0].name.replace("pos-", "");
  const post = (data: unknown, origin = "http://localhost:3100") => page.request.post(`/e/${SLUG}/submit`, { headers: { Origin: origin }, data });

  expect((await post({ idempotencyKey: "a".repeat(24), choices: [{ position_id: positionId, candidate_ids: ["11111111-1111-4111-8111-111111111111"] }] })).status()).toBe(400);
  expect((await post({ idempotencyKey: "b".repeat(24), choices: [{ position_id: positionId, candidate_ids: [radios[0].value] }] }, "https://evil.example")).status()).toBe(403);

  const key = "replay-key-" + Date.now();
  const first = await (await post({ idempotencyKey: key, choices: [{ position_id: positionId, candidate_ids: [radios[0].value] }] })).json();
  const second = await (await post({ idempotencyKey: key, choices: [{ position_id: positionId, candidate_ids: [radios[1].value] }] })).json();
  expect(first.receipt).toMatch(/^VA-/);
  expect(second.replayed).toBe(true);
  expect(second.receipt).toBe(first.receipt);
  const third = await (await post({ idempotencyKey: "fresh-" + Date.now(), choices: [{ position_id: positionId, candidate_ids: [radios[1].value] }] })).json();
  expect(third.accepted).toBe(0);
  expect(third.alreadyVoted).toBe(1);

  await page.goto(`/e/${SLUG}/done`);
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  const after = await post({ idempotencyKey: "after-" + Date.now(), choices: [{ position_id: positionId, candidate_ids: [radios[0].value] }] });
  expect(after.status()).toBe(401);
});

test("unpublished results are not visible to voters or the public", async ({ page }) => {
  await loginAdmin(page, NF, PW);
  await page.goto(new URL(page.url()).pathname.replace(/\/$/, "") + "/elections");
  await page.getByRole("link", { name: "Sports Council Election 2026" }).click();
  const ref = (await page.locator("text=/Ref E-[0-9A-F]{10}/").textContent())!.match(/E-[0-9A-F]{10}/)![0];
  await page.context().clearCookies();
  const r = await page.goto(`/r/${ref}`);
  expect(r!.status()).toBe(404);
  await page.goto(`/e/northfield-sports-council-2026`);
  await expect(page.getByText("Voting has closed")).toBeVisible();
  expect(await page.content()).not.toMatch(/Kiran Babu.*\d+ ·/);
});

test("cron endpoints require the secret", async ({ request }) => {
  expect((await request.get("/api/cron/tick")).status()).toBe(401);
  expect((await request.get("/api/cron/retention", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/tick", { headers: { Authorization: `Bearer ${CRON}` } });
  expect(ok.status()).toBe(200);
});

test("malicious or disguised spreadsheets are rejected", async ({ page }) => {
  await loginAdmin(page, NF, PW);
  await page.goto(new URL(page.url()).pathname.replace(/\/$/, "") + "/elections");
  await page.getByRole("link", { name: "Arts Club Elections 2026" }).click();
  await page.waitForURL(/elections\/[0-9a-f-]{36}$/);
  await page.goto(page.url() + "/voters");
  for (const f of [
    { name: "voters.csv", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) },             // zip disguised as CSV
    { name: "voters.xlsx", buffer: Buffer.from("this is not a workbook") },                       // fake xlsx
    { name: "voters.exe", buffer: Buffer.from("MZ") },                                             // executable
  ]) {
    await page.setInputFiles("#file", { name: f.name, mimeType: "application/octet-stream", buffer: f.buffer });
    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Unsupported file|could not be read/ })).toBeVisible();
  }
  // Formula payloads are imported as plain text and can never execute.
  await page.setInputFiles("#file", { name: "voters.csv", mimeType: "text/csv", buffer: Buffer.from('Email,Name\nx1@northfield.test,"=HYPERLINK(""http://evil"")"\n') });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("ready to import")).toBeVisible();
});

test("security headers are present", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("repeated wrong passwords lock the account", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.goto("/admin/login");
    await page.fill("#email", RV); await page.fill("#password", "wrong-password-" + i);
    await page.click("button[type=submit]");
    await expect(page.getByText(/incorrect|locked/)).toBeVisible();
  }
  await page.goto("/admin/login");
  await page.fill("#email", RV); await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await expect(page.getByText(/temporarily locked/)).toBeVisible();
});
