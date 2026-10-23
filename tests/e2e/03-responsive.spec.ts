import { test, expect, type Page } from "@playwright/test";
import { loginAdmin, loginSuper } from "./helpers";

/** Layout checks across device classes: no horizontal scrolling, navigation usable, key content visible. */
const DEVICES = [
  { name: "small-android", width: 360, height: 740, mobile: true },
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-15", width: 393, height: 852, mobile: true },
  { name: "ipad-portrait", width: 820, height: 1180, mobile: true },
  { name: "laptop", width: 1366, height: 768, mobile: false },
  { name: "large-display", width: 1920, height: 1080, mobile: false },
];
const PUBLIC = ["/", "/vote", "/help", "/privacy", "/e/northfield-union-2026", "/e/northfield-union-2026/verify", "/admin/login"];

async function noHorizontalScroll(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(iw + 1);
}

for (const d of DEVICES) {
  test.describe(d.name, () => {
    test.use({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile });
    test("public and voter pages fit the screen", async ({ page }) => {
      for (const p of PUBLIC) {
        await page.goto(p);
        await noHorizontalScroll(page);
        await page.screenshot({ path: `test-results/screens/${d.name}${p.replace(/\//g, "_") || "_home"}.png` });
      }
    });
    test("college dashboard and navigation", async ({ page }) => {
      await loginAdmin(page, "admin@northfield.test", "TestMode-Admin-2026!");
      await noHorizontalScroll(page);
      if (d.width < 1024) {
        await page.getByRole("button", { name: "Menu" }).click();
        await expect(page.locator("#mobile-nav").getByRole("link", { name: "Elections" })).toBeVisible();
        await page.locator("#mobile-nav").getByRole("link", { name: "Elections" }).click();
        await expect(page.getByRole("heading", { name: "All elections" })).toBeVisible();
      } else {
        await page.getByRole("link", { name: "Elections", exact: true }).click();
      }
      await noHorizontalScroll(page);
      await page.screenshot({ path: `test-results/screens/${d.name}_college-elections.png`, fullPage: true });
    });
  });
}

test("developer console renders on phone and desktop", async ({ page }) => {
  await loginSuper(page);
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.goto("/platform");
    await noHorizontalScroll(page);
    await page.screenshot({ path: `test-results/screens/platform-${vp.width}.png`, fullPage: true });
  }
});

test("PWA manifest and service worker are served", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.name).toContain("V.app");
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain("NEVER cache ballots");
  expect((await request.get("/offline")).status()).toBe(200);
});
