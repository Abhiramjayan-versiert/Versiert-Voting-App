import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { lifecycleTick, deliveryRun } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lifecycle = await lifecycleTick();
  const notifications = await deliveryRun();
  return NextResponse.json({ ok: true, lifecycle, notifications });
}
