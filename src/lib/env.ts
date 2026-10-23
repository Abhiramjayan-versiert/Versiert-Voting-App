import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_MODE: z.enum(["test", "production"]).default("production"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  HMAC_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(40),
  CRON_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});

let cached: z.infer<typeof schema> | null = null;
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid server environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  const e = parsed.data;
  if (e.APP_MODE === "production") {
    if (!e.APP_URL.startsWith("https://")) throw new Error("APP_URL must be https in production");
    if (/dev-only|change-me/i.test(e.HMAC_SECRET + e.ENCRYPTION_KEY + e.CRON_SECRET)) {
      throw new Error("Development secrets detected in production configuration");
    }
    if (!e.RESEND_API_KEY || !e.EMAIL_FROM) throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production");
  }
  cached = e;
  return e;
}
export const isTestMode = () => env().APP_MODE === "test";
