import { describe, expect, it } from "vitest";
import type { SharedEnvelope } from "@web/features/sharing/hooks/use-shared-envelopes";
import {
  buildSharedGroups,
  extractStateArray,
  makeFilterPredicate,
} from "./aggregate-helpers";

describe("extractStateArray", () => {
  it("envelope 이 null 이면 빈 배열", () => {
    expect(extractStateArray(null, "investments")).toEqual([]);
  });

  it("state 가 없으면 빈 배열", () => {
    const env: SharedEnvelope["envelope"] = { state: undefined as unknown as Record<string, unknown>, version: 1 };
    expect(extractStateArray(env, "investments")).toEqual([]);
  });

  it("키가 배열이 아니면 빈 배열", () => {
    const env: SharedEnvelope["envelope"] = { state: { investments: "not-array" }, version: 1 };
    expect(extractStateArray(env, "investments")).toEqual([]);
  });

  it("키가 배열이면 그 배열을 그대로 반환", () => {
    const env: SharedEnvelope["envelope"] = {
      state: { investments: [{ id: "a" }, { id: "b" }] },
      version: 1,
    };
    expect(extractStateArray(env, "investments")).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("존재하지 않는 키는 빈 배열", () => {
    const env: SharedEnvelope["envelope"] = { state: {}, version: 1 };
    expect(extractStateArray(env, "investments")).toEqual([]);
  });
});

describe("buildSharedGroups", () => {
  const owners = [
    { ownerId: "u1", ownerName: "친구1", label: null },
    { ownerId: "u2", ownerName: "친구2", label: "공동" },
  ];

  it("envelope 이 없으면 빈 items 그룹을 만든다", () => {
    const groups = buildSharedGroups(owners, new Map(), "investments");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toEqual([]);
    expect(groups[0]?.ownerName).toBe("친구1");
    expect(groups[1]?.ownerLabel).toBe("공동");
  });

  it("envelope 이 있으면 stateKey 의 배열을 items 로 추출", () => {
    const envelopes = new Map<string, SharedEnvelope>([
      [
        "u1",
        {
          owner: owners[0]!,
          envelope: { state: { investments: [{ id: "a" }] }, version: 1 },
        },
      ],
    ]);
    const groups = buildSharedGroups(owners, envelopes, "investments");
    expect(groups[0]?.items).toEqual([{ id: "a" }]);
    expect(groups[1]?.items).toEqual([]);
  });

  it("envelope=null (캐시 미스 후 fetch 실패) 이어도 안전", () => {
    const envelopes = new Map<string, SharedEnvelope>([
      ["u1", { owner: owners[0]!, envelope: null }],
    ]);
    const groups = buildSharedGroups(owners, envelopes, "investments");
    expect(groups[0]?.items).toEqual([]);
  });

  it("아무 owner 없으면 빈 배열", () => {
    expect(buildSharedGroups([], new Map(), "investments")).toEqual([]);
  });

  it("stateKey 가 다른 도메인 store 라면 그 키로 추출", () => {
    const envelopes = new Map<string, SharedEnvelope>([
      [
        "u1",
        {
          owner: owners[0]!,
          envelope: {
            state: { savings: [{ id: "s1" }], investments: [{ id: "i1" }] },
            version: 2,
          },
        },
      ],
    ]);
    const groups = buildSharedGroups(owners, envelopes, "savings");
    expect(groups[0]?.items).toEqual([{ id: "s1" }]);
  });
});

describe("makeFilterPredicate", () => {
  it("빈 배열은 모두 표시", () => {
    const pred = makeFilterPredicate([]);
    expect(pred("a")).toBe(true);
    expect(pred("__self__")).toBe(true);
  });

  it("배열이 있으면 그 ID 만 표시", () => {
    const pred = makeFilterPredicate(["a", "__self__"]);
    expect(pred("a")).toBe(true);
    expect(pred("__self__")).toBe(true);
    expect(pred("b")).toBe(false);
  });

  it("동일 호출에서 ID 가 set 이라 O(1) 조회", () => {
    const pred = makeFilterPredicate(["a", "b", "c"]);
    expect(pred("c")).toBe(true);
    expect(pred("d")).toBe(false);
  });
});
