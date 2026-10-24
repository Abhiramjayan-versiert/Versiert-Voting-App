"use server";
import { redirect } from "next/navigation";
import { verifyVoterIdentity, verifyVoterCode, endVoterSession } from "@/lib/voter";
import { ipHash } from "@/lib/request";
import { run, str } from "@/lib/action-utils";
import { getConfig } from "@/lib/config";
import type { ActionState } from "@/components/forms";

export async function verifyVoterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug");
  let ok = false;
  const res = await run(async () => {
    if ((await getConfig()).maintenance_mode) return { error: "V.app is under maintenance. Please try again shortly." };
    const r = await verifyVoterIdentity(slug, str(fd, "email"), str(fd, "student_id"), await ipHash());
    if (!r.ok) return { error: r.message };
    if ("codeSent" in r && r.codeSent) return { ok: true, message: r.message, data: { codeSent: true } };
    ok = true;
  });
  if (ok) redirect(`/e/${slug}/ballot`);
  return res;
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug");
  let ok = false;
  const res = await run(async () => {
    if ((await getConfig()).maintenance_mode) return { error: "V.app is under maintenance. Please try again shortly." };
    const r = await verifyVoterCode(slug, str(fd, "email"), str(fd, "code"), await ipHash());
    if (!r.ok) return { error: r.message };
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
