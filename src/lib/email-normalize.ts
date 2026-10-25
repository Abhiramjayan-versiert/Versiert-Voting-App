import { z } from "zod";

/** Canonical form used everywhere eligibility is compared. Deliberately conservative:
 *  trims, removes zero-width chars, NFKC-normalises and lower-cases. It does NOT strip
 *  dots or "+tags", a college mail server may treat those as different mailboxes. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.normalize("NFKC").replace(/[​-‍﻿]/g, "").trim().toLowerCase().replace(/^mailto:/, "");
  if (!s || s.length > 254) return null;
  return z.string().email().safeParse(s).success && /^[\x21-\x7e]+$/.test(s) ? s : null;
}

export function emailDomain(email: string) {
  return email.slice(email.lastIndexOf("@") + 1);
}

export function domainAllowed(email: string, domains: string[]) {
  if (!domains.length) return true;
  const d = emailDomain(email);
  return domains.some((x) => d === x.toLowerCase() || d.endsWith("." + x.toLowerCase()));
}

/** Canonical student ID: NFKC, upper-case, all whitespace removed. Used for matching voters. */
export function normalizeStudentId(v: unknown) {
  if (typeof v !== "string") return "";
  return v.normalize("NFKC").replace(/\s+/g, "").toUpperCase().slice(0, 40);
}
