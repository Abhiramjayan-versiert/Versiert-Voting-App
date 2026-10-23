import { describe, it, expect } from "vitest";
import { effectiveStatus, isAcceptingVotes, canTransition, purgeAfter, validateSchedule, isEditable } from "@/lib/lifecycle";

const now = new Date("2026-10-24T10:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3600_000);

describe("lifecycle", () => {
  it("computes the effective status independent of cron timing", () => {
    expect(effectiveStatus({ status: "scheduled", starts_at: h(1), ends_at: h(5) }, now)).toBe("scheduled");
    expect(effectiveStatus({ status: "scheduled", starts_at: h(-1), ends_at: h(5) }, now)).toBe("open");
    expect(effectiveStatus({ status: "open", starts_at: h(-5), ends_at: h(-1) }, now)).toBe("closed");
    expect(effectiveStatus({ status: "paused", starts_at: h(-5), ends_at: h(-1) }, now)).toBe("paused");
    expect(effectiveStatus({ status: "draft", starts_at: h(-5), ends_at: h(5) }, now)).toBe("draft");
  });
  it("accepts votes only when open", () => {
    expect(isAcceptingVotes({ status: "scheduled", starts_at: h(-1), ends_at: h(1) }, now)).toBe(true);
    expect(isAcceptingVotes({ status: "paused", starts_at: h(-1), ends_at: h(1) }, now)).toBe(false);
    expect(isAcceptingVotes({ status: "draft", starts_at: h(-1), ends_at: h(1) }, now)).toBe(false);
    expect(isAcceptingVotes({ status: "open", starts_at: h(-1), ends_at: now }, now)).toBe(false);
  });
  it("only drafts are structurally editable", () => {
    expect(isEditable({ status: "draft", starts_at: h(1), ends_at: h(2) })).toBe(true);
    expect(isEditable({ status: "scheduled", starts_at: h(1), ends_at: h(2) })).toBe(false);
  });
  it("enforces the transition graph", () => {
    expect(canTransition("draft", "scheduled")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("results_pending", "published")).toBe(true);
    expect(canTransition("deleted", "draft")).toBe(false);
    expect(canTransition("open", "draft")).toBe(false);
  });
  it("schedules retention deletion", () => {
    expect(purgeAfter(new Date("2026-01-01T00:00:00Z"), 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
  it("validates schedules", () => {
    expect(validateSchedule(h(1), h(2), now)).toEqual([]);
    expect(validateSchedule(h(2), h(1), now).join()).toMatch(/end after/);
    expect(validateSchedule(h(-3), h(-2), now).join()).toMatch(/past/);
    expect(validateSchedule(h(1), new Date(h(1).getTime() + 60_000), now).join()).toMatch(/5 minutes/);
    expect(validateSchedule(h(1), h(24 * 40), now).join()).toMatch(/31 days/);
  });
});
