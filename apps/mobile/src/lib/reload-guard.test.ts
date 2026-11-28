import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 화면을 다시 불러오는 길은 `reloadApp()` (`lib/device-storage.ts`) 하나다. 앱의 기기 저장(SQLite)은
 * 쓰기를 비동기로 줄 세우므로, 저장을 기다리지 않고 새로고침하면 local 모드의 유일한 사본이 사라질 수 있다.
 */
const SRC_ROOT = resolve(__dirname, "..");
const ALLOWED_FILES = ["lib/device-storage.ts"];
const RELOAD = /\blocation\.reload\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

describe("page reloads", () => {
  it("go through reloadApp() so pending device writes are saved first", () => {
    const violations = sourceFiles(SRC_ROOT)
      .map((file) => relative(SRC_ROOT, file))
      .filter((rel) => !ALLOWED_FILES.includes(rel))
      .filter((rel) => RELOAD.test(readFileSync(join(SRC_ROOT, rel), "utf8")));

    expect(violations).toEqual([]);
  });
});
