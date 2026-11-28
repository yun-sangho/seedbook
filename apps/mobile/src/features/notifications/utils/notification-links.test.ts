import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notification-links";

describe("notificationTarget", () => {
  it("opens the garden for goal and drift notifications", () => {
    expect(notificationTarget("goal").tab).toBe("home");
    expect(notificationTarget("drift").tab).toBe("home");
  });
  it("opens the rebalancing tab for rebalancing reminders", () => {
    expect(notificationTarget("rebalancing")).toEqual({
      path: "/rebalancing",
      tab: "rebalancing",
    });
  });
  it("falls back to home for unknown kinds", () => {
    expect(notificationTarget(undefined).tab).toBe("home");
  });
});
