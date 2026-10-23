import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { retentionRun } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, retention: await retentionRun() });
}
