import "server-only";
import { ZodError } from "zod";
import { UserError } from "./elections";
import type { ActionState } from "@/components/forms";

/** Converts thrown errors into safe, user-facing action state. Unexpected errors never leak details. */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: string }).digest).startsWith("NEXT_")) throw err; // redirect/notFound
    if (err instanceof UserError) return { error: err.message };
    if (err instanceof ZodError) return { error: err.issues.map((i) => i.message).join(" ") };
    console.error("[action]", (err as Error)?.name, (err as Error)?.message);
    return { error: "Something went wrong. Nothing was changed. Please try again." };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Parses a datetime-local value as wall-clock time in an IANA timezone. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).reduce<Record<string, number>>((a, p) => (p.type !== "literal" ? { ...a, [p.type]: Number(p.value) } : a), {});
  const asTz = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asTz - guess));
}
export function utcToZonedInput(d: Date | string, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(d)).reduce<Record<string, string>>((a, x) => (x.type !== "literal" ? { ...a, [x.type]: x.value } : a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Validates an uploaded image by magic bytes and size. */
export async function readImage(f: FormDataEntryValue | null, maxKb = 600): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!f || typeof f === "string" || f.size === 0) return null;
  if (f.size > maxKb * 1024) throw new UserError(`Images must be under ${maxKb} KB.`);
  const bytes = Buffer.from(await f.arrayBuffer());
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png"
    : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" ? "image/webp" : null;
  if (!mime) throw new UserError("Upload a JPEG, PNG or WebP image.");
  return { bytes, mime };
}
