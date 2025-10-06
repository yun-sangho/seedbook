import { beforeEach, describe, expect, it } from "vitest";
import type { AssetProgressPoint } from "../types/progress";
import { useProgressStore } from "./progress-store";

describe("useProgressStore", () => {
  beforeEach(() => {
    // 각 테스트 전 스토어 초기화
    useProgressStore.getState().clearProgressPoints();
  });

  it("should add progress points", () => {
    const point: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point);

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(1);
    expect(state.progressPoints[0]).toEqual(point);
  });

  it("should merge points with the same date", () => {
    const point1: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    const point2: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1500,
      netAssets: 1500,
      investments: 1500,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point1);
    useProgressStore.getState().addProgressPoint(point2);

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(1);
    expect(state.progressPoints[0]).toEqual(point2); // 두 번째 값으로 덮어쓰기
  });

  it("should sort points by date", () => {
    const point1: AssetProgressPoint = {
      date: "2024-03-01",
      totalAssets: 3000,
      netAssets: 3000,
      investments: 3000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    const point2: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    const point3: AssetProgressPoint = {
      date: "2024-02-01",
      totalAssets: 2000,
      netAssets: 2000,
      investments: 2000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point1);
    useProgressStore.getState().addProgressPoint(point2);
    useProgressStore.getState().addProgressPoint(point3);

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(3);
    expect(state.progressPoints[0]?.date).toBe("2024-01-01");
    expect(state.progressPoints[1]?.date).toBe("2024-02-01");
    expect(state.progressPoints[2]?.date).toBe("2024-03-01");
  });

  it("should update a progress point", () => {
    const point: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point);
    useProgressStore.getState().updateProgressPoint("2024-01-01", {
      totalAssets: 1500,
      investments: 1500,
    });

    const state = useProgressStore.getState();
    expect(state.progressPoints[0]?.totalAssets).toBe(1500);
    expect(state.progressPoints[0]?.investments).toBe(1500);
    expect(state.progressPoints[0]?.netAssets).toBe(1000); // 변경되지 않음
  });

  it("should delete a progress point", () => {
    const point1: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    const point2: AssetProgressPoint = {
      date: "2024-02-01",
      totalAssets: 2000,
      netAssets: 2000,
      investments: 2000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point1);
    useProgressStore.getState().addProgressPoint(point2);
    useProgressStore.getState().deleteProgressPoint("2024-01-01");

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(1);
    expect(state.progressPoints[0]?.date).toBe("2024-02-01");
  });

  it("should set multiple progress points", () => {
    const points: AssetProgressPoint[] = [
      {
        date: "2024-01-01",
        totalAssets: 1000,
        netAssets: 1000,
        investments: 1000,
        savings: 0,
        realAssets: 0,
        loans: 0,
      },
      {
        date: "2024-02-01",
        totalAssets: 2000,
        netAssets: 2000,
        investments: 2000,
        savings: 0,
        realAssets: 0,
        loans: 0,
      },
    ];

    useProgressStore.getState().setProgressPoints(points);

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(2);
    expect(state.progressPoints).toEqual(points);
  });

  it("should clear all progress points", () => {
    const point: AssetProgressPoint = {
      date: "2024-01-01",
      totalAssets: 1000,
      netAssets: 1000,
      investments: 1000,
      savings: 0,
      realAssets: 0,
      loans: 0,
    };

    useProgressStore.getState().addProgressPoint(point);
    useProgressStore.getState().clearProgressPoints();

    const state = useProgressStore.getState();
    expect(state.progressPoints).toHaveLength(0);
  });
});
