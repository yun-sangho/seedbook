import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalMarkdown } from "./legal-markdown";

describe("LegalMarkdown", () => {
  it("renders headings, paragraphs and lists", () => {
    render(<LegalMarkdown source={"## 1. 목적\n\n문단\n\n- 하나\n- 둘"} />);

    expect(screen.getByRole("heading", { level: 2, name: "1. 목적" })).toBeInTheDocument();
    expect(screen.getByText("문단")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["하나", "둘"]);
  });

  it("renders allowed links", () => {
    render(<LegalMarkdown source="[메일](mailto:a@b.c) [KISA](https://privacy.kisa.or.kr)" />);

    expect(screen.getByRole("link", { name: "메일" })).toHaveAttribute("href", "mailto:a@b.c");
    expect(screen.getByRole("link", { name: "KISA" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
  });

  it("shows HTML as text instead of running it", () => {
    const { container } = render(
      <LegalMarkdown source={'<img src=x onerror="alert(1)"> [x](javascript:alert(1))'} />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
