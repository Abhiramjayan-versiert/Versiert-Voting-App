import { createHmac } from "node:crypto";
import type { Page, BrowserContext } from "@playwright/test";

export const SUPER = { email: "dev@vapp.test", password: "TestMode-Dev-2026!", totp: "VAPPDEMOSUPERADMINTESTMODE234567" };
export const CRON = "e2e-cron-secret-0123456789";

export function totp(secret: string, offset = 0) {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out: number[] = [];
  for (const ch of secret) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Waits for a TOTP step that hasn't been used yet — the server rejects replayed codes. */
let lastStep = 0;
export async function freshTotp(secret: string) {
  for (;;) {
    const step = Math.floor(Date.now() / 30000), left = 30000 - (Date.now() % 30000);
    if (step > lastStep && left > 4000) { lastStep = step; return totp(secret); }
    await new Promise((r) => setTimeout(r, left + 300));
  }
}

export async function loginSuper(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", SUPER.email); await page.fill("#password", SUPER.password);
  await page.click("button[type=submit]"); await page.waitForURL(/\/admin\/mfa/);
  await page.fill("#code", await freshTotp(SUPER.totp)); await page.click("button[type=submit]");
  await page.waitForURL(/\/platform$/);
}

export async function loginAdmin(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.fill("#email", email); await page.fill("#password", password);
  await page.click("button[type=submit]"); await page.waitForURL(/\/college\//);
}

/** Student ID for a fixture address: studentNNN@northfield.test → T0NNN, voterN@e2e-college.test → ROLLN. */
export function sidFor(email: string) {
  const m = email.match(/^student(\d+)@/); if (m) return "T" + m[1].padStart(4, "0");
  const v = email.match(/^voter(\d+)@/); if (v) return "ROLL" + v[1];
  throw new Error("no fixture student ID for " + email);
}

export async function verifyVoter(page: Page, _ctx: BrowserContext, slug: string, email: string, studentId = sidFor(email)) {
  await page.goto(`/e/${slug}/verify`);
  await page.fill("#email", email); await page.fill("#student_id", studentId);
  await page.click("button:has-text('Verify and open ballot')");
  await page.waitForURL(new RegExp(`/e/${slug}/ballot`));
}

/** Local wall-clock string for a datetime-local input in Asia/Kolkata. */
export function istInput(offsetMin: number) {
  const d = new Date(Date.now() + offsetMin * 60_000 + 330 * 60_000);
  return d.toISOString().slice(0, 16);
}
