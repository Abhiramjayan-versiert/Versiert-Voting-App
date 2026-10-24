import { test, expect } from "@playwright/test";
import { loginSuper, loginAdmin } from "./helpers";

/** Super Admin has full election access across all colleges. Runs last: it deletes a seeded election. */
test.describe.configure({ mode: "serial" });

test("Super Admin can open, run, view results of, export and create elections in any college", async ({ page }) => {
  await loginSuper(page);
  await page.goto("/platform/elections");
  await expect(page.getByRole("heading", { name: "All elections" })).toBeVisible();

  // Results of a closed election at Northfield
  const row = page.locator("tr", { hasText: "Sports Council Election 2026" });
  await row.getByRole("link", { name: "Results" }).click();
  await expect(page.getByText("All passed")).toBeVisible();
  await expect(page.getByText(/Tie — needs resolution/)).toBeVisible();
  const resultsUrl = new URL(page.url()).pathname;
  const eid = resultsUrl.split("/elections/")[1].split("/")[0];
  const r = await page.request.get(`/api/exports/${eid}/report.xlsx`);
  expect(r.status()).toBe(200);

  // Live aggregate tally of the running union election (totals only — never individual ballots)
  await page.goto("/platform/elections");
  await page.locator("tr", { hasText: "College Union Election 2026" }).first().getByRole("link", { name: "Results" }).click();
  await expect(page.getByText("Provisional — voting in progress")).toBeVisible();
  await expect(page.getByText(/^Live · refreshed/)).toBeVisible();
  expect(await page.content()).not.toMatch(/student\d{3}@northfield\.test/);

  // Manage an election at the OTHER college (Riverside) — full dashboard, not forbidden
  await page.goto("/platform/elections");
  await page.locator("tr", { hasText: "Students' Council 2026" }).getByRole("link", { name: "Manage" }).click();
  await expect(page.getByText("Super Admin: delete this election")).toBeVisible();
  await expect(page.getByText("Super Admin · full access")).toBeVisible();

  // Create a new election for a college
  await page.goto("/platform/elections");
  await page.getByRole("link", { name: "+ Riverside College of Arts & Science" }).click();
  await page.fill("#event_name", "Super Admin Test Event");
  await page.fill("#title", "Created by Super Admin");
  await page.getByRole("button", { name: "Save and continue →" }).click();
  await expect(page).toHaveURL(/\/voters\?created=1/);
});

test("college admins cannot use Super Admin deletion", async ({ page }) => {
  // The admin created in 01-full-election (fewer sign-ins, so the per-account limit isn't hit).
  await loginAdmin(page, "admin@e2e-college.test", "Ballot-Keeper-2026!");
  await page.goto("/platform/elections");
  await expect(page).toHaveURL(/\/forbidden/);
});

test("Super Admin can permanently delete a running election", async ({ page, request }) => {
  await loginSuper(page);
  await page.goto("/platform/elections");
  const row = page.locator("tr", { hasText: "College Union Election 2026" });
  const ref = (await row.locator(".font-mono").first().textContent())!.trim();
  await row.getByRole("button", { name: "Delete" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.locator("textarea[name=reason]").fill("E2E: verifying Super Admin deletion of a running election");
  await dlg.locator("input[autocomplete=off]").fill(ref);
  await dlg.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText(/Election permanently deleted/)).toBeVisible();
  await expect(page.locator("tr", { hasText: "College Union Election 2026" })).toHaveCount(0);
  expect((await request.get("/e/northfield-union-2026")).status()).toBe(404);

  // Edit, then delete, a college administrator.
  await page.goto("/platform/admins");
  await page.locator("tr", { hasText: "admin@riverside.test" }).getByRole("link", { name: "Rahul Menon" }).click();
  await expect(page.getByRole("heading", { name: "Edit details" })).toBeVisible();
  await page.fill("#name", "Riverside Admin Renamed");
  await page.fill("#email", "renamed@riverside.test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Administrator details saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Riverside Admin Renamed" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();
  let dlg2 = page.locator("dialog[open]");
  await dlg2.locator("textarea[name=reason]").fill("E2E: verifying Super Admin can delete an administrator");
  await dlg2.locator("input[autocomplete=off]").fill("renamed@riverside.test");
  await dlg2.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText(/Administrator account deleted/)).toBeVisible();
  await expect(page.getByText("renamed@riverside.test")).toHaveCount(0);

  // Edit, then delete, a whole college (with its elections).
  await page.goto("/platform/colleges");
  await page.getByRole("link", { name: "Riverside College of Arts & Science" }).click();
  await page.fill("#city", "Kochi");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("College details saved.")).toBeVisible();
  const code = "RCAS-DEMO";
  await page.getByRole("button", { name: "Delete college permanently" }).click();
  dlg2 = page.locator("dialog[open]");
  await dlg2.locator("textarea[name=reason]").fill("E2E: verifying Super Admin can delete a college");
  await dlg2.locator("input[autocomplete=off]").fill(code);
  await dlg2.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText(/College deleted permanently/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Riverside College of Arts & Science" })).toHaveCount(0);
  await page.goto("/platform/elections");
  await expect(page.locator("tr", { hasText: "Created by Super Admin" })).toHaveCount(0);
  await page.goto("/platform/audit");
  await expect(page.getByText("college.delete").first()).toBeVisible();
});
