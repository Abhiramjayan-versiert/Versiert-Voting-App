import { describe, it, expect } from "vitest";
import { normalizeEmail, domainAllowed, normalizeStudentId } from "@/lib/email-normalize";

describe("email normalisation", () => {
  it("trims, lower-cases and NFKC-normalises", () => {
    expect(normalizeEmail("  Student@College.EDU ")).toBe("student@college.edu");
    expect(normalizeEmail("ＳＴＵＤＥＮＴ@college.edu")).toBe("student@college.edu");
  });
  it("strips zero-width characters and mailto:", () => {
    expect(normalizeEmail("stu​dent@college.edu")).toBe("student@college.edu");
    expect(normalizeEmail("mailto:a@b.edu")).toBe("a@b.edu");
  });
  it("keeps dots and +tags (college servers may treat them as distinct)", () => {
    expect(normalizeEmail("first.last+vote@college.edu")).toBe("first.last+vote@college.edu");
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "no-at-sign", "a@", "@b.edu", "a b@c.edu", null, 42, "x".repeat(250) + "@a.edu", "ünï@college.edu"]) expect(normalizeEmail(bad)).toBeNull();
  });
  it("normalises student IDs (case, spaces, full-width)", () => {
    expect(normalizeStudentId(" tve 25 mba03 ")).toBe("TVE25MBA03");
    expect(normalizeStudentId("ＴＶＥ２５")).toBe("TVE25");
    expect(normalizeStudentId(null)).toBe("");
  });
  it("checks approved domains including subdomains", () => {
    expect(domainAllowed("a@college.edu", ["college.edu"])).toBe(true);
    expect(domainAllowed("a@students.college.edu", ["college.edu"])).toBe(true);
    expect(domainAllowed("a@evilcollege.edu", ["college.edu"])).toBe(false);
    expect(domainAllowed("a@anything.com", [])).toBe(true);
  });
});
