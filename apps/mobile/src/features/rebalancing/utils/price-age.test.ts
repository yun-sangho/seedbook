import { describe, expect, it } from "vitest";
import { priceAgeWarning } from "./price-age";

const NOW = new Date("2026-11-08T13:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60 * 1000;

describe("priceAgeWarning", () => {
  it("5분 미만 차이는 경고하지 않는다", () => {
    expect(priceAgeWarning(ago(4 * MIN + 59_000), NOW)).toBeNull();
  });

  it("5분 이상 차이는 분 단위로 알린다", () => {
    expect(priceAgeWarning(ago(5 * MIN), NOW)).toBe(
      "지금보다 5분 전 가격이에요. 시세가 달라졌을 수 있어요."
    );
  });

  it("1시간 이상이면 시간 단위", () => {
    expect(priceAgeWarning(ago(3 * 60 * MIN + 20 * MIN), NOW)).toBe(
      "지금보다 3시간 전 가격이에요. 시세가 달라졌을 수 있어요."
    );
  });

  it("하루 이상이면 일 단위", () => {
    expect(priceAgeWarning(ago(2 * 24 * 60 * MIN + 30 * MIN), NOW)).toBe(
      "지금보다 2일 전 가격이에요. 시세가 달라졌을 수 있어요."
    );
  });

  it("시각이 잘못됐거나 미래면 경고하지 않는다", () => {
    expect(priceAgeWarning("nope", NOW)).toBeNull();
    expect(priceAgeWarning(new Date(NOW.getTime() + 10 * MIN).toISOString(), NOW)).toBeNull();
  });
});
