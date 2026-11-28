import { beforeEach, describe, expect, it } from "vitest";
import { createAddressBarHistory } from "./address-bar-history";

describe("createAddressBarHistory", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/accounts");
  });

  it("starts at the current browser URL", () => {
    // Arrange
    window.history.replaceState(null, "", "/portfolios/p1?tab=a");

    // Act
    const history = createAddressBarHistory();

    // Assert
    expect(history.location.pathname).toBe("/portfolios/p1");
    expect(history.location.search).toBe("?tab=a");
  });

  it("does not add browser history entries when the stack pushes", () => {
    const history = createAddressBarHistory();
    const lengthBefore = window.history.length;

    history.push("/accounts/a1");
    history.push("/accounts/a1/more");

    expect(window.history.length).toBe(lengthBefore);
  });

  it("mirrors the stack URL to the address bar so a reload reopens the same screen", () => {
    const history = createAddressBarHistory();

    history.push("/accounts/a1");

    expect(window.location.pathname).toBe("/accounts/a1");
  });

  it("mirrors the URL when the stack goes back", () => {
    const history = createAddressBarHistory();
    history.push("/accounts/a1");

    history.back();

    expect(window.location.pathname).toBe("/accounts");
  });

  it("does not react to browser popstate (there is no in-app browser history)", () => {
    const history = createAddressBarHistory();
    history.push("/accounts/a1");

    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    expect(history.location.pathname).toBe("/accounts/a1");
  });
});
