import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 클라이언트 코드가 API 를 `apiFetch`/`accountFetch` (`lib/api-client.ts`) 로만 부르는지 지킨다.
 * 직접 `fetch("/api/...")` 하면 앱 번들이 API 서버 주소(`API_BASE_URL`)를 따르지 못한다.
 */
const WEB_ROOT = resolve(__dirname, "..");
const CLIENT_DIRS = ["app", "components", "features", "hooks", "lib", "utils"];

/** 클라이언트 트리 안이지만 서버에서만 도는 곳. */
const SERVER_ONLY = [
  "app/api/", // 라우트 핸들러
  "lib/stock-quotes/", // 서버가 외부 시세 API 를 부른다
];
/** fetch 를 직접 부를 수 있는 유일한 파일. */
const ALLOWED_FILES = ["lib/api-client.ts"];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "fetch()", pattern: /(?<![\w$])(?:(?:window|globalThis|self)\.)?fetch\s*\(/ },
  { name: "new EventSource()", pattern: /new\s+EventSource\s*\(/ },
  { name: "sendBeacon()", pattern: /\.sendBeacon\s*\(/ },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** 주석 안의 예시(`fetch("/api/...")`)는 세지 않는다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("client API calls", () => {
  it("go through apiFetch/accountFetch instead of calling fetch directly", () => {
    const violations: string[] = [];
    for (const dir of CLIENT_DIRS) {
      for (const file of sourceFiles(join(WEB_ROOT, dir))) {
        const rel = relative(WEB_ROOT, file);
        if (ALLOWED_FILES.includes(rel) || SERVER_ONLY.some((p) => rel.startsWith(p))) continue;
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          for (const { name, pattern } of FORBIDDEN) {
            if (pattern.test(line)) violations.push(`${rel}:${i + 1} ${name}`);
          }
        });
      }
    }

    expect(violations).toEqual([]);
  });
});
