import { describe, expect, it } from "vitest";
import { wantsDevSqlite } from "./sqljs-driver";

describe("wantsDevSqlite", () => {
  it("uses WASM SQLite by default on the development server", () => {
    expect(wantsDevSqlite({ cookie: "", nodeEnv: "development" })).toBe(true);
  });

  it("falls back to localStorage in development when the cookie asks for it", () => {
    const cookie = "a=1; seedbook.deviceDb=local";

    expect(wantsDevSqlite({ cookie, nodeEnv: "development" })).toBe(false);
  });

  it("never uses it in a production build, even with the cookie", () => {
    const cookie = "seedbook.deviceDb=sqlite";

    expect(wantsDevSqlite({ cookie, nodeEnv: "production" })).toBe(false);
  });

  it("stays opt-in under test so unit tests keep localStorage", () => {
    expect(wantsDevSqlite({ cookie: "", nodeEnv: "test" })).toBe(false);
    expect(wantsDevSqlite({ cookie: "seedbook.deviceDb=sqlite", nodeEnv: "test" })).toBe(true);
  });
});
