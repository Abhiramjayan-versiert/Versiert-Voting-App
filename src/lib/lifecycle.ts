// Pure election lifecycle rules.
export type Status = "draft" | "scheduled" | "open" | "paused" | "closed" | "results_pending" | "published" | "retention" | "deleted";

export type ElectionTimes = { status: Status; starts_at: Date | string; ends_at: Date | string };

/** Status as it should be right now, regardless of whether the cron job has run yet. */
export function effectiveStatus(e: ElectionTimes, now = new Date()): Status {
  const s = new Date(e.starts_at), en = new Date(e.ends_at);
  if ((e.status === "scheduled" || e.status === "open") && now >= en) return "closed";
  if (e.status === "scheduled" && now >= s) return "open";
  return e.status;
}

export const isAcceptingVotes = (e: ElectionTimes, now = new Date()) => effectiveStatus(e, now) === "open";

/** Structural edits (positions, candidates, voter list, rules) are only allowed before activation. */
export const isEditable = (e: ElectionTimes) => e.status === "draft";

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft", scheduled: "Scheduled", open: "Open", paused: "Paused", closed: "Closed",
  results_pending: "Results pending review", published: "Published", retention: "Retention period", deleted: "Deleted",
};

const TRANSITIONS: Record<Status, Status[]> = {
  draft: ["scheduled"],
  scheduled: ["draft", "open", "closed"],
  open: ["paused", "closed"],
  paused: ["open", "closed"],
  closed: ["results_pending"],
  results_pending: ["published"],
  published: ["results_pending", "retention"],
  retention: ["deleted"],
  deleted: [],
};
export const canTransition = (from: Status, to: Status) => TRANSITIONS[from].includes(to);

/** When the retention period ends. */
export function purgeAfter(publishedAt: Date, retentionDays: number) {
  return new Date(publishedAt.getTime() + retentionDays * 86_400_000);
}

export function validateSchedule(startsAt: Date, endsAt: Date, now = new Date()) {
  const errors: string[] = [];
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) errors.push("Start and end times are required.");
  else {
    if (endsAt <= startsAt) errors.push("The election must end after it starts.");
    if (endsAt.getTime() - startsAt.getTime() < 5 * 60_000) errors.push("Voting must stay open for at least 5 minutes.");
    if (endsAt.getTime() - startsAt.getTime() > 31 * 86_400_000) errors.push("Voting cannot stay open longer than 31 days.");
    if (endsAt <= now) errors.push("The closing time is already in the past.");
  }
  return errors;
}

/** Candidate tallies (who is leading/winning) are visible to the Super Admin at any time, to college admins only once published. */
export function talliesVisible(role: string, effective: string) {
  return role === "super_admin" || ["published", "retention", "deleted"].includes(effective);
}
