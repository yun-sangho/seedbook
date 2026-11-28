import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { kindForPortfolio } from "@mobile/features/garden/utils/garden-home";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileAvatarImage } from "./profile-avatar";

// clipPath id (useId) 는 렌더마다 달라 지운다.
const withoutIds = (html: string) => html.replace(/_r_\w+_/g, "");

function portfolioIdOf(kind: "tree" | "fern"): string {
  for (let i = 0; i < 100; i++) {
    const id = `portfolio-${i}`;
    if (kindForPortfolio(id) === kind) return id;
  }
  throw new Error(`no ${kind} id`);
}

describe("ProfileAvatarImage", () => {
  it.each(["tree", "fern"] as const)("draws the %s that the portfolio grows", (kind) => {
    // 해시 종류와 다른 포트폴리오여도 고른 종류를 그린다.
    const portfolioId = portfolioIdOf(kind === "tree" ? "fern" : "tree");
    const avatar = render(
      <ProfileAvatarImage
        avatar={{
          kind: "plant",
          portfolioId,
          color: "#000000",
          stage: 3,
          plantKind: kind,
          ripe: false,
          chosen: true,
        }}
        size={48}
      />
    ).container.querySelector("svg")?.outerHTML;
    const expected = render(<PlantAvatar stage="tree" kind={kind} size={48} />).container.innerHTML;
    expect(withoutIds(avatar ?? "")).toBe(withoutIds(expected));
  });
});
