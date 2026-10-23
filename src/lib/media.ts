import "server-only";
import { NextResponse } from "next/server";
import { withCtx, systemCtx } from "./db";
import { getAdminSession } from "./auth";
import { isUuid } from "./action-utils";

/** Images are public only once an election is activated; drafts are visible to the owning college's admins. */
export async function serveImage(kind: "candidate" | "banner" | "logo", id: string) {
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });
  const [row] = await withCtx(systemCtx, (tx) =>
    kind === "candidate" ? tx`select c.photo as bytes, c.photo_mime as mime, e.status, e.college_id from candidates c join elections e on e.id = c.election_id where c.id = ${id}`
    : kind === "banner" ? tx`select banner as bytes, banner_mime as mime, status, college_id from elections where id = ${id}`
    : tx`select logo as bytes, logo_mime as mime, 'active' as status, id as college_id from colleges where id = ${id}`);
  if (!row?.bytes || !row.mime) return new NextResponse(null, { status: 404 });
  if (row.status === "draft") {
    const s = await getAdminSession();
    const ok = s && (s.user.role === "super_admin" || s.collegeIds.includes(row.college_id));
    if (!ok) return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(row.bytes as Buffer as unknown as BodyInit, {
    headers: { "Content-Type": row.mime, "Cache-Control": row.status === "draft" ? "private, no-store" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "Content-Disposition": "inline" },
  });
}
