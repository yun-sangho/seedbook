import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpdateGate, UpdateRequiredScreen } from "./update-gate";

describe("UpdateGate", () => {
  it("renders the app in a browser without checking for updates", () => {
    render(
      <UpdateGate>
        <p>앱</p>
      </UpdateGate>
    );

    expect(screen.getByText("앱")).toBeInTheDocument();
  });
});

describe("UpdateRequiredScreen", () => {
  it("links to the store when the address is known", () => {
    render(<UpdateRequiredScreen storeUrl="https://play.google.com/store/apps/details?id=x" />);

    expect(screen.getByRole("link", { name: "업데이트하기" })).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=x"
    );
  });

  it("still explains the update when the store address is not known yet", () => {
    render(<UpdateRequiredScreen storeUrl={null} />);

    expect(screen.getByRole("heading", { name: "업데이트가 필요해요" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
