import { beforeEach, describe, expect, it } from "vitest";
import { createNextAwareHistory } from "./next-aware-history";

describe("createNextAwareHistory", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/assets/investments");
  });

  it("starts at the current browser URL", () => {
    // Arrange
    window.history.replaceState(null, "", "/assets/portfolio/p1?tab=a");

    // Act
    const history = createNextAwareHistory();

    // Assert
    expect(history.location.pathname).toBe("/assets/portfolio/p1");
    expect(history.location.search).toBe("?tab=a");
  });

  it("does not add browser history entries when the stack pushes", () => {
    const history = createNextAwareHistory();
    const lengthBefore = window.history.length;

    history.push("/assets/investments/a1");
    history.push("/assets/investments/a1/more");

    expect(window.history.length).toBe(lengthBefore);
  });

  it("mirrors the stack URL to the address bar so a reload reopens the same screen", () => {
    const history = createNextAwareHistory();

    history.push("/assets/investments/a1");

    expect(window.location.pathname).toBe("/assets/investments/a1");
  });

  it("mirrors the URL when the stack goes back", () => {
    const history = createNextAwareHistory();
    history.push("/assets/investments/a1");

    history.back();

    expect(window.location.pathname).toBe("/assets/investments");
  });

  it("does not react to browser popstate (there is no in-app browser history)", () => {
    const history = createNextAwareHistory();
    history.push("/assets/investments/a1");

    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    expect(history.location.pathname).toBe("/assets/investments/a1");
  });
});
