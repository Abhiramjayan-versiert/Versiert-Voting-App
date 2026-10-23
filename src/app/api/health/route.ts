import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const dynamic = "force-dynamic";
/** Liveness probe for uptime monitors. Reveals nothing beyond up/down. */
export async function GET() {
  try { await sql()`select 1`; return NextResponse.json({ status: "ok" }); }
  catch { return NextResponse.json({ status: "degraded" }, { status: 503 }); }
}
