import { execFileSync } from "node:child_process";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionButton } from "./action-button";

/** 레포 루트. 앱 화면(apps/mobile/src)과 소개 사이트(apps/web)의 버튼을 함께 본다. */
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const BUTTON_SOURCES = [
  "apps/mobile/src/app",
  "apps/mobile/src/features",
  "apps/mobile/src/components",
  "apps/web/app",
  "apps/web/components",
];

describe("ActionButton", () => {
  it("defaults to neutralSolid instead of SEED's brandSolid", () => {
    render(<ActionButton>저장</ActionButton>);

    expect(screen.getByRole("button", { name: "저장" }).className).toContain(
      "seed-action-button--variant_neutralSolid"
    );
  });

  it("keeps an explicit variant", () => {
    render(<ActionButton variant="criticalSolid">삭제</ActionButton>);

    expect(screen.getByRole("button", { name: "삭제" }).className).toContain(
      "seed-action-button--variant_criticalSolid"
    );
  });
});

describe("brand color on buttons", () => {
  it("is not used by any app button (buttons emphasize with neutralSolid)", () => {
    // 브랜드 초록은 진행 바·안내 문구·배지에만 쓴다. 버튼은 neutralSolid 로 강조한다.
    let matches = "";
    try {
      matches = execFileSync(
        "grep",
        [
          "-rnE",
          'variant="brand(Solid|Outline)"|variant: "brand(Solid|Outline)"',
          ...BUTTON_SOURCES,
        ],
        { cwd: REPO_ROOT, encoding: "utf8" }
      );
    } catch (error) {
      // grep 은 찾은 것이 없으면 1 로 끝난다. 그 밖의 실패(폴더 없음 등)는 테스트를 실패시킨다.
      if ((error as { status?: number }).status !== 1) throw error;
    }

    expect(matches).toBe("");
  });
});
