import { DEFAULT_NOTIFICATION_SETTINGS } from "@seedbook/domain/notifications";
import { describe, expect, it } from "vitest";
import { planReminders } from "./reminder-plan";

// 2026-11-28 10:00 KST
const NOW = new Date("2026-11-28T01:00:00.000Z");
// 이탈을 처음 본 날 (KST 날짜 시작) — 11-25 00:00 KST
const DRIFT_SINCE = "2026-11-24T15:00:00.000Z";

const settings = DEFAULT_NOTIFICATION_SETTINGS; // 7일째, 19시

describe("planReminders", () => {
  it("schedules a drift reminder on the chosen day at the chosen KST hour", () => {
    const plan = planReminders({
      settings,
      drifts: [{ label: "몽글이", driftSince: DRIFT_SINCE }],
      rebalancings: [],
      now: NOW,
    });
    expect(plan).toEqual([
      {
        id: 20261202,
        at: new Date("2026-12-02T10:00:00.000Z"), // 12-02 19:00 KST
        title: "몽글이",
        body: "비중이 기준을 벗어난 지 7일째예요. 정원에서 확인해 보세요.",
        kind: "drift",
      },
    ]);
  });

  it("follows the chosen day count and hour", () => {
    const [reminder] = planReminders({
      settings: { ...settings, driftDays: 3, reminderHour: 11 },
      drifts: [{ label: "몽글이", driftSince: DRIFT_SINCE }],
      rebalancings: [],
      now: NOW,
    });
    expect(reminder?.at.toISOString()).toBe("2026-11-28T02:00:00.000Z"); // 11-28 11:00 KST
    expect(reminder?.body).toContain("3일째");
  });

  it("skips a reminder whose time has passed (it is sent once per drift)", () => {
    const plan = planReminders({
      settings: { ...settings, driftDays: 3, reminderHour: 8 },
      drifts: [{ label: "몽글이", driftSince: DRIFT_SINCE }],
      rebalancings: [],
      now: NOW,
    });
    expect(plan).toEqual([]);
  });

  it("reminds about rebalancing tasks left three days after starting", () => {
    const [reminder] = planReminders({
      settings,
      drifts: [],
      rebalancings: [{ label: "연금 계좌", startedAt: "2026-11-27T05:00:00.000Z", remaining: 2 }],
      now: NOW,
    });
    expect(reminder).toEqual({
      id: 20261130,
      at: new Date("2026-11-30T10:00:00.000Z"),
      title: "연금 계좌",
      body: "리밸런싱 할 일이 2개 남았어요.",
      kind: "rebalancing",
    });
  });

  it("does not remind about finished rebalancing", () => {
    expect(
      planReminders({
        settings,
        drifts: [],
        rebalancings: [{ label: "연금", startedAt: "2026-11-27T05:00:00.000Z", remaining: 0 }],
        now: NOW,
      })
    ).toEqual([]);
  });

  it("merges reminders on the same day into one", () => {
    const plan = planReminders({
      settings,
      drifts: [{ label: "몽글이", driftSince: DRIFT_SINCE }],
      rebalancings: [{ label: "연금 계좌", startedAt: "2026-11-29T05:00:00.000Z", remaining: 1 }],
      now: NOW,
    });
    expect(plan).toEqual([
      {
        id: 20261202,
        at: new Date("2026-12-02T10:00:00.000Z"),
        title: "확인할 것이 2개 있어요",
        body: "몽글이 비중 이탈 7일째 · 연금 계좌 리밸런싱 할 일 1개",
        kind: "drift",
      },
    ]);
  });

  it("leaves out kinds that are turned off", () => {
    expect(
      planReminders({
        settings: { ...settings, drift: false, rebalancing: false },
        drifts: [{ label: "몽글이", driftSince: DRIFT_SINCE }],
        rebalancings: [{ label: "연금", startedAt: "2026-11-27T05:00:00.000Z", remaining: 2 }],
        now: NOW,
      })
    ).toEqual([]);
  });

  it("ignores unreadable drift dates", () => {
    expect(
      planReminders({
        settings,
        drifts: [{ label: "몽글이", driftSince: "nope" }],
        rebalancings: [],
        now: NOW,
      })
    ).toEqual([]);
  });
});
