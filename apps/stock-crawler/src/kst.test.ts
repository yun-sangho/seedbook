import { kstDateString, kstDateStringCompact, kstDayOfWeek, kstMidnight } from "@seedbook/database";
import { describe, expect, it } from "vitest";

/**
 * 본 테스트는 Node 프로세스의 TZ 에 의존하면 안 된다. Docker 컨테이너는 UTC 로
 * 돌고 있고, 헬퍼는 어느 TZ 에서도 동일하게 KST 기준 결과를 내야 한다.
 */

describe("kstDateString", () => {
  it("16:30 KST cron 트리거 시각 → KST 당일", () => {
    // 2025-04-14 16:30 KST = 2025-04-14 07:30 UTC
    const date = new Date("2025-04-14T07:30:00Z");
    expect(kstDateString(date)).toBe("2025-04-14");
  });

  it("TZ 경계: KST 월요일 새벽 = UTC 일요일 밤", () => {
    // 2025-04-14 05:00 KST = 2025-04-13 20:00 UTC
    const date = new Date("2025-04-13T20:00:00Z");
    expect(kstDateString(date)).toBe("2025-04-14");
  });

  it("TZ 경계: KST 자정 직후 = UTC 전날 15:00", () => {
    // 2025-04-14 00:01 KST = 2025-04-13 15:01 UTC
    const date = new Date("2025-04-13T15:01:00Z");
    expect(kstDateString(date)).toBe("2025-04-14");
  });

  it("TZ 경계: KST 자정 직전 = UTC 당일 14:59", () => {
    // 2025-04-14 23:59 KST = 2025-04-14 14:59 UTC
    const date = new Date("2025-04-14T14:59:00Z");
    expect(kstDateString(date)).toBe("2025-04-14");
  });

  it("월말 경계", () => {
    // 2025-04-30 23:30 KST = 2025-04-30 14:30 UTC
    expect(kstDateString(new Date("2025-04-30T14:30:00Z"))).toBe("2025-04-30");
    // 2025-05-01 00:30 KST = 2025-04-30 15:30 UTC
    expect(kstDateString(new Date("2025-04-30T15:30:00Z"))).toBe("2025-05-01");
  });
});

describe("kstDateStringCompact", () => {
  it("YYYYMMDD 포맷 (하이픈 없음)", () => {
    expect(kstDateStringCompact(new Date("2025-04-14T07:30:00Z"))).toBe("20250414");
  });

  it("TZ 경계에서도 KST 날짜", () => {
    // 2025-04-14 05:00 KST = 2025-04-13 20:00 UTC
    expect(kstDateStringCompact(new Date("2025-04-13T20:00:00Z"))).toBe("20250414");
  });
});

describe("kstDayOfWeek", () => {
  it("KST 월요일 16:30 (= UTC 월요일 07:30) → 1", () => {
    expect(kstDayOfWeek(new Date("2025-04-14T07:30:00Z"))).toBe(1);
  });

  it("KST 월요일 05:00 (= UTC 일요일 20:00) → 1 ★", () => {
    // 이 테스트가 핵심: 호스트가 UTC 라면 .getDay() 는 0(일) 을 리턴하지만
    // KST 기준으로는 월요일이 맞다.
    expect(kstDayOfWeek(new Date("2025-04-13T20:00:00Z"))).toBe(1);
  });

  it("KST 일요일 18:00 (= UTC 일요일 09:00) → 0", () => {
    expect(kstDayOfWeek(new Date("2025-04-13T09:00:00Z"))).toBe(0);
  });

  it("KST 금요일 23:59 (= UTC 금요일 14:59) → 5", () => {
    expect(kstDayOfWeek(new Date("2025-04-18T14:59:00Z"))).toBe(5);
  });

  it("KST 토요일 00:01 (= UTC 금요일 15:01) → 6 ★", () => {
    // 호스트 UTC 기준 .getDay() 는 5(금) 을 리턴하지만 KST 기준으로는 토요일이다.
    expect(kstDayOfWeek(new Date("2025-04-18T15:01:00Z"))).toBe(6);
  });
});

describe("kstMidnight", () => {
  it("16:30 KST → 00:00 KST 의 instant (= UTC 15:00 전날)", () => {
    // 2025-04-14 16:30 KST = 2025-04-14 07:30 UTC
    const input = new Date("2025-04-14T07:30:00Z");
    const midnight = kstMidnight(input);
    // 2025-04-14 00:00 KST = 2025-04-13 15:00 UTC
    expect(midnight.toISOString()).toBe("2025-04-13T15:00:00.000Z");
  });

  it("TZ 경계에서도 같은 KST 달력일이면 같은 instant 를 반환", () => {
    // 아래 세 값은 모두 KST 기준 2025-04-14 의 어떤 시각
    const earlyMorning = new Date("2025-04-13T20:00:00Z"); // 05:00 KST
    const afternoon = new Date("2025-04-14T07:30:00Z"); // 16:30 KST
    const lateNight = new Date("2025-04-14T14:59:00Z"); // 23:59 KST

    const expected = "2025-04-13T15:00:00.000Z";
    expect(kstMidnight(earlyMorning).toISOString()).toBe(expected);
    expect(kstMidnight(afternoon).toISOString()).toBe(expected);
    expect(kstMidnight(lateNight).toISOString()).toBe(expected);
  });

  it("다음 날과 구분된다", () => {
    // 2025-04-14 23:59 KST vs 2025-04-15 00:01 KST
    const day1 = kstMidnight(new Date("2025-04-14T14:59:00Z"));
    const day2 = kstMidnight(new Date("2025-04-14T15:01:00Z"));
    expect(day1.toISOString()).toBe("2025-04-13T15:00:00.000Z");
    expect(day2.toISOString()).toBe("2025-04-14T15:00:00.000Z");
    expect(day1.getTime()).not.toBe(day2.getTime());
  });
});
