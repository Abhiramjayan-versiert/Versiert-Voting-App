import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireCollegeAdmin } from "./auth";
import { getElection } from "./elections";
import { isUuid } from "./action-utils";

/** Loads the election for a college-admin page. RLS + the college check make cross-college access a 404. */
export const loadElection = cache(async (cid: string, eid: string) => {
  if (!isUuid(cid) || !isUuid(eid)) notFound();
  const { s, ctx } = await requireCollegeAdmin(cid);
  const e = await getElection(ctx, eid);
  if (!e || e.college_id !== cid) notFound();
  return { s, ctx, e, base: `/college/${cid}/elections/${eid}` };
});
