"use server";
import { redirect } from "next/navigation";
import { requestVoterCode, verifyVoterCode, endVoterSession } from "@/lib/voter";
import { clientIp, ipHash } from "@/lib/request";
import { run, str } from "@/lib/action-utils";
import { getConfig } from "@/lib/config";
import type { ActionState } from "@/components/forms";

export async function requestCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    if ((await getConfig()).maintenance_mode) return { error: "V.app is under maintenance. Please try again shortly." };
    const slug = str(fd, "slug"), email = str(fd, "email");
    const r = await requestVoterCode(slug, email, await ipHash(), await clientIp(), str(fd, "cf-turnstile-response") || undefined);
    return r.ok ? { ok: true, message: r.message, data: { email } } : { error: r.message, data: { captcha: r.captchaRequired } };
  });
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug");
  let ok = false;
  const res = await run(async () => {
    const r = await verifyVoterCode(slug, str(fd, "email"), str(fd, "code"), await ipHash());
    if (!r.ok) return { error: r.message, data: { email: str(fd, "email") } };
    ok = true;
  });
  if (ok) redirect(`/e/${slug}/ballot`);
  return res;
}

export async function voterSignOutAction(fd: FormData) {
  const slug = str(fd, "slug");
  if (/^[a-z0-9][a-z0-9-]{3,80}$/.test(slug)) await endVoterSession(slug);
  redirect(`/e/${slug}?signed_out=1`);
}
