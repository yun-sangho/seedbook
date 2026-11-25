// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedError, TestModule } from "vitest/node";
import { failureLogReporter } from "./failure-log";

const error = (message: string) => ({ name: "Error", message }) as SerializedError;

/** 실패한 테스트(이름)와 파일 자체의 오류만 가진 테스트 파일 대역. */
function testModule(file: string, failedTests: string[], errors: SerializedError[] = []) {
  return {
    relativeModuleId: file,
    errors: () => errors,
    children: {
      allSuites: () => [],
      allTests: () =>
        failedTests.map((fullName) => ({
          fullName,
          diagnostic: () => ({ duration: 5001.4 }),
          result: () => ({ errors: [error("Test timed out in 5000ms.")] }),
        })),
    },
  } as unknown as TestModule;
}

describe("failureLogReporter", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "failure-log-")), "logs");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(join(dir, ".."), { recursive: true });
  });

  const end = (modules: TestModule[], unhandled: SerializedError[] = []) =>
    failureLogReporter(dir).onTestRunEnd?.(modules, unhandled, "failed");
  const logs = () => readdirSync(dir).map((file) => readFileSync(join(dir, file), "utf8"));

  it("writes nothing when every test passed", async () => {
    await end([testModule("a.test.ts", [])]);

    expect(existsSync(dir)).toBe(false);
  });

  it("records the file, name, duration and error of a failed test", async () => {
    await end([testModule("a.test.ts", ["group > case"])]);

    expect(logs()[0]).toContain(
      "FAIL a.test.ts > group > case (5001ms)\nError: Test timed out in 5000ms."
    );
  });

  it("records a file that could not be loaded", async () => {
    await end([testModule("a.test.ts", [], [error("Failed to resolve import")])]);

    expect(logs()[0]).toContain("FAIL a.test.ts\nError: Failed to resolve import");
  });

  it("records errors thrown outside tests", async () => {
    await end([], [error("boom")]);

    expect(logs()[0]).toContain("FAIL (unhandled)\nError: boom");
  });

  it("keeps the record of an earlier run", async () => {
    vi.useFakeTimers({ now: 0 });
    await end([testModule("a.test.ts", ["first"])]);
    vi.setSystemTime(1000);
    await end([testModule("a.test.ts", ["second"])]);
    vi.useRealTimers();

    expect(logs()).toHaveLength(2);
  });
});
