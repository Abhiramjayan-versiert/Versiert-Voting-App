import { describe, it, expect } from "vitest";
import { totpAt, verifyTotp, base32Encode, base32Decode, encrypt, decrypt, numericCode, safeEqual } from "@/lib/crypto";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 Appendix B test vector, SHA-1 secret "12345678901234567890", T=59 → 94287082 (8 digits) → 287082 (6 digits)
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vector", () => { expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082"); });
  it("accepts ±1 step and rejects others", () => {
    const t = 1_700_000_000_000;
    const code = totpAt(secret, Math.floor(t / 30000));
    expect(verifyTotp(secret, code, t)).not.toBeNull();
    expect(verifyTotp(secret, code, t + 30000)).not.toBeNull();
    expect(verifyTotp(secret, code, t + 90000)).toBeNull();
    expect(verifyTotp(secret, "abc123", t)).toBeNull();
  });
  it("base32 round-trips", () => { const b = Buffer.from([1, 2, 3, 250, 99]); expect(base32Decode(base32Encode(b)).equals(b)).toBe(true); });
});

describe("secrets at rest", () => {
  const key = Buffer.alloc(32, 9).toString("base64");
  it("AES-GCM round-trips and detects tampering", () => {
    const c = encrypt("JBSWY3DPEHPK3PXP", key);
    expect(decrypt(c, key)).toBe("JBSWY3DPEHPK3PXP");
    const parts = c.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });
  it("rejects wrong key length", () => { expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow(); });
});

describe("one-time codes", () => {
  it("are 6 digits and well distributed", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) { const c = numericCode(); expect(c).toMatch(/^\d{6}$/); seen.add(c); }
    expect(seen.size).toBeGreaterThan(1990);
  });
  it("constant-time compare", () => { expect(safeEqual("abc", "abc")).toBe(true); expect(safeEqual("abc", "abd")).toBe(false); expect(safeEqual("a", "ab")).toBe(false); });
});
