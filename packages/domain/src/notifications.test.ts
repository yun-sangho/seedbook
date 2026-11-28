import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  enabledServerKinds,
  goalReachedMessage,
  isQuietHour,
  kstDayAt,
  REMINDER_HOURS,
  readNotificationSettings,
  wonLabel,
} from "./notifications";

describe("isQuietHour", () => {
  it("is quiet from 21:00 KST", () => {
    expect(isQuietHour(new Date("2026-11-27T12:00:00Z"))).toBe(true); // 21:00 KST
  });
  it("is quiet until 08:00 KST", () => {
    expect(isQuietHour(new Date("2026-11-27T22:59:00Z"))).toBe(true); // 07:59 KST
  });
  it("is not quiet at 08:00 and 20:59 KST", () => {
    expect(isQuietHour(new Date("2026-11-27T23:00:00Z"))).toBe(false);
    expect(isQuietHour(new Date("2026-11-27T11:59:00Z"))).toBe(false);
  });
});

describe("kstDayAt", () => {
  it("counts days from the KST calendar day of the instant", () => {
    // 2026-11-28 01:00 KST (= 11-27 16:00Z) → 3일 뒤 19시 KST = 2026-12-01 10:00Z
    expect(kstDayAt(new Date("2026-11-27T16:00:00Z"), 3, 19).toISOString()).toBe(
      "2026-12-01T10:00:00.000Z"
    );
  });
});

describe("REMINDER_HOURS", () => {
  it("only offers hours outside quiet time", () => {
    expect(REMINDER_HOURS[0]).toBe(8);
    expect(REMINDER_HOURS.at(-1)).toBe(20);
  });
});

describe("readNotificationSettings", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(readNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(readNotificationSettings({ driftDays: 5, reminderHour: 23, goal: "yes" })).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    );
  });
  it("keeps valid choices", () => {
    expect(readNotificationSettings({ drift: false, driftDays: 14, reminderHour: 9 })).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      drift: false,
      driftDays: 14,
      reminderHour: 9,
    });
  });
});

describe("enabledServerKinds", () => {
  it("lists only server kinds that are on", () => {
    expect(enabledServerKinds(DEFAULT_NOTIFICATION_SETTINGS)).toEqual(["goal"]);
    expect(enabledServerKinds({ ...DEFAULT_NOTIFICATION_SETTINGS, goal: false })).toEqual([]);
  });
});

describe("wonLabel", () => {
  it("formats like numberToKorean", () => {
    expect(wonLabel(12_000_000)).toBe("1,200만원");
    expect(wonLabel(150_000_000)).toBe("1억5,000만원");
    expect(wonLabel(9_999)).toBe("0원");
  });
});

describe("goalReachedMessage", () => {
  it("names the plant and the goal", () => {
    expect(
      goalReachedMessage([{ label: "몽글이", goalAmount: 12_000_000, growthStage: 1 }])
    ).toEqual({
      title: "몽글이",
      body: "평가금액이 목표 1,200만원에 닿았어요. 정원에서 확인해 보세요.",
    });
  });
  it("calls the flower-stage goal the last goal", () => {
    expect(
      goalReachedMessage([{ label: "몽글이", goalAmount: 30_000_000, growthStage: 4 }])?.body
    ).toBe("평가금액이 마지막 목표 3,000만원에 닿았어요. 정원에서 확인해 보세요.");
  });
  it("merges several plants into one notification", () => {
    expect(
      goalReachedMessage([
        { label: "몽글이", goalAmount: 1, growthStage: 0 },
        { label: "연금", goalAmount: 1, growthStage: 2 },
      ])
    ).toEqual({
      title: "목표에 닿은 식물이 2개 있어요",
      body: "몽글이, 연금 · 정원에서 확인해 보세요.",
    });
  });
  it("is null with nothing reached", () => {
    expect(goalReachedMessage([])).toBeNull();
  });
});
