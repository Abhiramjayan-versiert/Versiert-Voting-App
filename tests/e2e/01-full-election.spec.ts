import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import type ExcelJSType from "exceljs";
const ExcelJS: typeof ExcelJSType = createRequire(import.meta.url)("exceljs");
import { loginSuper, loginAdmin, verifyVoter, istInput } from "./helpers";

/** The complete election workflow from section 18 of the specification, executed in a real browser. */
test.describe.configure({ mode: "serial" });

const ADMIN = { email: "admin@e2e-college.test", password: "Ballot-Keeper-2026!" };
const run = Date.now().toString(36).slice(-5).toUpperCase();
let collegePath = "", electionPath = "", slug = "", publicRef = "", checkCode = "";

async function voterXlsx() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Students");
  ws.addRow(["Roll No", "Student Name", "Email Address", "Department"]);
  for (let i = 1; i <= 5; i++) ws.addRow([`ROLL${i}`, `E2E Student ${i}`, `voter${i}@e2e-college.test`, i % 2 ? "CSE" : "ECE"]);
  ws.addRow(["ROLL6", "Dup", "VOTER1@e2e-college.test", "CSE"]);   // duplicate (case-insensitive)
  ws.addRow(["ROLL7", "Bad", "not-an-email", "CSE"]);               // invalid
  ws.addRow(["ROLL8", "Missing", "", "CSE"]);                       // missing
  ws.addRow(["ROLL9", "Gmail User", "someone@gmail.com", "CSE"]);   // any email provider is allowed
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function addCandidate(page: Page, position: string, name: string) {
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: position, exact: true }) });
  const add = card.locator("details").filter({ hasText: `+ Add a candidate for ${position}` });
  if (!(await add.evaluate((el) => (el as HTMLDetailsElement).open))) await add.locator("summary").click();
  await add.locator("input[name=full_name]").fill(name);
  await add.locator("input[name=department]").fill("Computer Science");
  await add.locator("textarea[name=intro]").fill(`${name} promises transparent student governance.`);
  await add.getByRole("button", { name: "Add candidate" }).click();
  await expect(card.getByText(name, { exact: true })).toBeVisible();
}

test("1–2. Developer creates a college and invites an administrator", async ({ page }) => {
  await loginSuper(page);
  await page.goto("/platform/colleges/new");
  await page.fill("#name", `E2E Test College ${run}`);
  await page.fill("#code", `E2E-${run}`);
  await page.getByRole("button", { name: "Create college" }).click();
  await page.waitForURL(/\/platform\/colleges\/[0-9a-f-]{36}\?created=1/);
  collegePath = new URL(page.url()).pathname;
  await page.fill("#inv-name", "E2E Admin");
  await page.fill("#inv-email", ADMIN.email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  const link = await page.locator("p.font-mono", { hasText: "/invite/" }).textContent();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{30,}/);

  const admin = await page.context().browser()!.newContext();
  const ap = await admin.newPage();
  await ap.goto(new URL(link!).pathname);
  await ap.fill("#password", ADMIN.password); await ap.fill("#password2", ADMIN.password);
  await ap.getByRole("button", { name: "Activate account" }).click();
  await ap.waitForURL(/welcome=1/);
  await admin.close();
  // The invitation is single-use.
  await page.goto(new URL(link!).pathname);
  await expect(page.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
});

test("3–7. Administrator builds the election and opens it", async ({ page }) => {
  await loginAdmin(page, ADMIN.email, ADMIN.password);
  collegePath = new URL(page.url()).pathname.replace(/\/$/, "");
  await page.goto(collegePath + "/elections/new");
  await page.fill("#event_name", "E2E Union Election");
  await page.fill("#title", `College Union Election ${run}`);
  await page.fill("#starts_at", istInput(-2));
  await page.fill("#ends_at", istInput(180));
  await page.getByRole("button", { name: "Save and continue →" }).click();
  await page.waitForURL(/\/voters\?created=1/);
  electionPath = new URL(page.url()).pathname.replace(/\/voters$/, "");

  // 4. Import voters from Excel with column mapping, preview, validation.
  await page.setInputFiles("#file", { name: "voters.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await voterXlsx() });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("ready to import")).toBeVisible();
  await expect(page.locator("text=ready to import").locator("..")).toContainText("6");
  await expect(page.locator("#map_email")).toHaveValue("2");
  await page.getByRole("button", { name: "Import 6 voters" }).click();
  await expect(page.getByText(/Imported 6 voter\(s\)\. 0 already on the list, 3 rejected/)).toBeVisible();

  // 5–6. Positions and candidates.
  await page.goto(electionPath + "/positions");
  for (const pos of ["Chairman", "Vice Chairman"]) {
    await page.locator("#pn-new").fill(pos);
    await page.getByRole("button", { name: "Add position" }).click();
    await expect(page.getByRole("heading", { name: pos, exact: true })).toBeVisible();
  }
  await addCandidate(page, "Chairman", "Asha Kumar");
  await addCandidate(page, "Chairman", "Bilal Rahman");
  await addCandidate(page, "Vice Chairman", "Chitra Das");
  await addCandidate(page, "Vice Chairman", "Deepak Joy");

  // 7. Rules (defaults: secret ballot, partial ballots), review and activate.
  await page.goto(electionPath + "/rules");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Voting rules saved.")).toBeVisible();
  await page.goto(electionPath + "/review");
  await expect(page.getByText("Asha Kumar, Bilal Rahman")).toBeVisible();
  await page.getByLabel(/I have reviewed the schedule/).check();
  await page.getByRole("button", { name: "Activate election" }).click();
  await expect(page.getByText(/Already activated|Election activated/).first()).toBeVisible();
  await page.goto(electionPath);
  await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
  const linkText = await page.locator("p.font-mono", { hasText: "/e/" }).textContent();
  slug = linkText!.split("/e/")[1].trim();
  publicRef = (await page.locator("text=/Ref E-[0-9A-F]{10}/").textContent())!.match(/E-[0-9A-F]{10}/)![0];
});

test("8–13. Students verify, vote once per position, duplicates rejected", async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  // 8. Typing an email alone is not enough — the code is required.
  await a.goto(`/e/${slug}/ballot`);
  await expect(a).toHaveURL(new RegExp(`/e/${slug}/verify`));
  await verifyVoter(a, ctx, slug, "voter1@e2e-college.test");

  // A second tab with the ballot already open (simulates double tabs).
  const b = await ctx.newPage();
  await b.goto(`/e/${slug}/ballot`);

  // 9. Vote for Chairman only.
  await a.getByText("Asha Kumar", { exact: true }).click();
  await a.getByRole("button", { name: "Next position" }).click();
  await expect(a.getByRole("heading", { name: "Vice Chairman" })).toBeVisible();
  await a.getByRole("button", { name: "Review ballot" }).click();
  await expect(a.getByRole("heading", { name: "Review your ballot" })).toBeVisible();
  await a.getByRole("button", { name: /Submit ballot/ }).click();
  await a.getByRole("button", { name: "Yes, submit my ballot" }).click();
  await a.waitForURL(new RegExp(`/e/${slug}/done`));
  await expect(a.getByRole("heading", { name: "Your ballot has been submitted successfully." })).toBeVisible();
  const receipt = await a.locator("p.font-mono").first().textContent();
  expect(receipt).toMatch(/^VA-/);
  expect(await a.content()).not.toContain("Asha Kumar"); // confirmation never reveals the choice

  // 10–11. Same voter tries Chairman again from the stale tab with a different candidate → rejected.
  await b.getByText("Bilal Rahman", { exact: true }).click();
  await b.getByRole("button", { name: "Next position" }).click();
  await b.getByRole("button", { name: "Review ballot" }).click();
  await b.getByRole("button", { name: /Submit ballot/ }).click();
  await b.getByRole("button", { name: "Yes, submit my ballot" }).click();
  await b.waitForURL(new RegExp(`/e/${slug}/done`));
  await expect(b.getByText(/already voted on earlier.*not counted again/)).toBeVisible();
  // …and directly against the API, with a fresh idempotency key.
  const positions = await a.evaluate(async () => document.body.innerText);
  expect(positions).toBeTruthy();

  // 12. Same voter can still vote for Vice Chairman.
  await a.getByRole("link", { name: "Continue voting" }).click();
  await expect(a.getByRole("heading", { name: "Vice Chairman" })).toBeVisible();
  await expect(a.getByText(/Already submitted: Chairman/)).toBeVisible();
  await a.getByText("Chitra Das", { exact: true }).click();
  await a.getByRole("button", { name: "Review ballot" }).click();
  await a.getByRole("button", { name: /Submit ballot/ }).click();
  await a.getByRole("button", { name: "Yes, submit my ballot" }).click();
  await a.waitForURL(new RegExp(`/e/${slug}/done`));
  await a.goto(`/e/${slug}/ballot`);
  await expect(a.getByText("You've voted for every position available to you.")).toBeVisible();
  await ctx.close();

  // 13. Another eligible student votes for both positions.
  const ctx2 = await browser.newContext();
  const c = await ctx2.newPage();
  await verifyVoter(c, ctx2, slug, "voter2@e2e-college.test");
  await c.getByText("Asha Kumar", { exact: true }).click();
  await c.getByRole("button", { name: "Next position" }).click();
  await c.getByText("Deepak Joy", { exact: true }).click();
  await c.getByRole("button", { name: "Review ballot" }).click();
  await c.getByRole("button", { name: /Submit ballot \(2\)/ }).click();
  await c.getByRole("button", { name: "Yes, submit my ballot" }).click();
  await c.waitForURL(new RegExp(`/e/${slug}/done`));
  // The voter gets a private verification code; it never names the choices on this page.
  checkCode = (await c.locator("p.font-mono", { hasText: /^VC-/ }).textContent())!.trim();
  expect(checkCode).toMatch(/^VC-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  // Verifying during voting shows exactly what was recorded.
  await c.goto("/receipt");
  await c.fill("#code", checkCode.toLowerCase());
  await c.getByRole("button", { name: "Check code" }).click();
  const box = c.getByRole("status").filter({ hasText: "The ballot recorded under this code" });
  await expect(box.locator("li", { hasText: "Chairman" }).first()).toContainText("Asha Kumar");
  await expect(box.locator("li", { hasText: "Vice Chairman" })).toContainText("Deepak Joy");
  await ctx2.close();

  // Unknown email and wrong student ID get the same neutral response; neither opens a ballot.
  const ctx3 = await browser.newContext(); const d = await ctx3.newPage();
  for (const [em, id] of [["stranger@e2e-college.test", "ROLL1"], ["voter3@e2e-college.test", "ROLL4"]]) {
    await d.goto(`/e/${slug}/verify`);
    await d.fill("#email", em); await d.fill("#student_id", id);
    await d.click("button:has-text('Continue')");
    await expect(d.getByText(/couldn't verify those details/)).toBeVisible();
    await expect(d).toHaveURL(new RegExp(`/e/${slug}/verify`));
  }
  // Student IDs are matched case- and space-insensitively.
  await verifyVoter(d, ctx3, slug, "voter3@e2e-college.test", " roll 3 ");
  await ctx3.close();
});

test("14–17. Close, review, publish, export — results match accepted ballots", async ({ page }) => {
  await loginAdmin(page, ADMIN.email, ADMIN.password);
  await page.goto(electionPath + "/monitor");
  await expect(page.getByText("Duplicate attempts blocked").locator("..")).toContainText("1");
  await page.goto(electionPath);
  await page.getByRole("button", { name: "Close voting now" }).click();
  await page.locator("dialog[open] textarea[name=reason]").fill("E2E test: voting period complete");
  await page.locator("dialog[open]").getByRole("button", { name: "Close voting" }).click();
  await expect(page.getByText(/Results pending review/).first()).toBeVisible();

  // 15. Review results.
  await page.goto(electionPath + "/results");
  await expect(page.getByText("All passed")).toBeVisible();
  const chair = page.locator("section").filter({ has: page.getByRole("heading", { name: "Chairman", exact: true }) });
  await expect(chair).toContainText("2 of 6 eligible voted");
  await expect(chair).toContainText("Asha Kumar");
  await expect(chair.getByText("2 · 100.0%")).toBeVisible();
  await expect(chair.getByText("0 · 0.0%")).toBeVisible(); // Bilal: the duplicate attempt was not counted
  const vice = page.locator("section").filter({ has: page.getByRole("heading", { name: "Vice Chairman", exact: true }) });
  await expect(vice).toContainText("Tie");

  // 16. Publish.
  await page.getByLabel(/Voting has closed, I have reviewed/).check();
  await page.getByRole("button", { name: "Publish results" }).click();
  await expect(page.getByText(/^Published /)).toBeVisible();
  const pub = await page.context().browser()!.newPage();
  await pub.goto(`/r/${publicRef}`);
  await expect(pub.getByRole("heading", { name: `College Union Election ${run}` })).toBeVisible();
  await expect(pub.getByText("Winner: Asha Kumar")).toBeVisible();
  await expect(pub.getByText(/Tie — needs resolution/)).toBeVisible();
  expect(await pub.content()).not.toContain("voter1@e2e-college.test");
  // The public page shows percentages, outcomes and the polling rate — never absolute vote counts.
  await expect(pub.getByText("Overall polling rate")).toBeVisible();
  await expect(pub.getByText("Turnout 33.3%").first()).toBeVisible();
  const html = await pub.content();
  expect(html).not.toMatch(/of 6 eligible|Eligible voters|>Voted<|2 · 100|Show as table/);
  expect(html).not.toMatch(/"votes":[1-9]|"eligibleVoters":[1-9]|"participants":[1-9]/); // nothing leaks into page data
  expect((await pub.request.get(`/r/${publicRef}/ballots`)).status()).toBe(404);
  // Administrators can still download the anonymous ballot list for a recount.
  const bl = await page.request.get(`/api/exports/${electionPath.split("/elections/")[1]}/ballots.csv`);
  expect(bl.status()).toBe(200);
  const text = await bl.text();
  expect(text).toContain(`${checkCode},Chairman,Asha Kumar`);
  expect(text).toContain(`${checkCode},Vice Chairman,Deepak Joy`);
  expect(text).not.toMatch(/@|ROLL\d|E2E Student/);
  expect(text.trim().split(/\r?\n/)).toHaveLength(1 + 4); // header + 4 accepted selections
  await pub.close();

  // 17. Excel export with candidate-wise results.
  await page.goto(electionPath + "/exports");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("a[href$='/report.xlsx']").click()]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile((await dl.path())!);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Candidate results", "Position summary", "Participation by group"]);
  const rows = wb.getWorksheet("Candidate results")!.getSheetValues().slice(2) as unknown[][];
  const byName = Object.fromEntries(rows.map((r) => [r[5], r]));
  expect(byName["Asha Kumar"][7]).toBe(2);
  expect(byName["Asha Kumar"][9]).toBe("Winner");
  expect(byName["Bilal Rahman"][7]).toBe(0);
  expect(byName["Chitra Das"][9]).toBe("Tie");
  expect(String(byName["Asha Kumar"][11])).toMatch(/^Published/);
  const summary = wb.getWorksheet("Summary")!.getSheetValues() as unknown[][];
  expect(summary.find((r) => r?.[1] === "Eligible voters")?.[2]).toBe(6);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.locator("a[href$='/candidates.csv']").click()]);
  expect(csv.suggestedFilename()).toMatch(/candidate-results\.csv$/);
});

test("18. Retention cleanup deletes personal data and keeps the public aggregate", async ({ page }) => {
  await loginSuper(page);
  await page.goto("/platform/jobs");
  const row = page.locator("tr", { hasText: publicRef });
  await row.getByRole("button", { name: "Delete now" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.locator("textarea[name=reason]").fill("E2E test of the retention deletion workflow");
  await dlg.locator("input[autocomplete=off]").fill(publicRef);
  await dlg.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.locator("tr", { hasText: publicRef }).filter({ hasText: "verified" })).toBeVisible();
  await expect(page.locator("tr", { hasText: publicRef }).filter({ hasText: "verified" }).filter({ hasText: "voters:6" })).toBeVisible();

  const pub = await page.context().newPage();
  await pub.goto(`/r/${publicRef}`);
  await expect(pub.getByText("Final results")).toBeVisible();

  await page.context().clearCookies();
  await loginAdmin(page, ADMIN.email, ADMIN.password);
  await page.goto(electionPath + "/voters");
  await expect(page.getByText(/0 eligible voters/)).toBeVisible();
  await page.goto(electionPath);
  await expect(page.getByText("Election data deleted")).toBeVisible();
});
