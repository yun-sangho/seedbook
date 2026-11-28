import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 앱 코드가 서버 코드를 끌어오지 않는지 지킨다. 앱(Vite SPA, `apps/mobile/src`)은 앱 번들로 나가므로
 * 닿는 모듈은 DB·drizzle·node 모듈 없이 돌아야 한다. 서버와 같이 쓰는 순수 로직은 `@seedbook/domain` 에
 * 둔다. 웹 서버(apps/web)는 앱 코드를 가져다 쓸 수 있지만 거꾸로는 안 된다. 타입 import 도 센다 —
 * 타입만 가져와도 그 파일이 서버 쪽에 묶인다.
 *
 * 직접 import 는 biome `noRestrictedImports` (biome.json overrides) 가 편집기에서 먼저 잡고, 이
 * 테스트는 앱 파일에서 import 를 따라가며 간접으로 닿는 것까지 본다.
 */
const SRC_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(SRC_ROOT, "../../..");
const DOMAIN_SRC = join(REPO_ROOT, "packages/domain/src");

/** 앱 안이지만 테스트에서만 쓰는 곳 (node:sqlite 테스트 드라이버). 여기서 시작하지 않고, 앱이 닿으면 위반이다. */
const TEST_ONLY = ["lib/native/device-db/testing/"];

const NODE_BUILTINS = new Set(builtinModules);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const IMPORT_RE =
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;

function importSpecifiers(file: string): string[] {
  const source = stripComments(readFileSync(file, "utf8"));
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

function resolveFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  // `./markdown.js` 처럼 확장자를 붙인 TS import.
  if (base.endsWith(".js")) candidates.push(base.replace(/\.js$/, ".ts"));
  return candidates.find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
}

type Target = { kind: "file"; path: string } | { kind: "forbidden"; name: string } | null;

/** 지금 쓰는 별칭만 푼다. 그 밖의 패키지는 따라가지 않는다 (node 내장 모듈은 위반). */
function resolveImport(specifier: string, from: string): Target {
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier.split("/")[0] ?? "")) {
    return { kind: "forbidden", name: specifier };
  }
  const forbiddenPackage = ["@seedbook/database", "@web"].some(
    (name) => specifier === name || specifier.startsWith(`${name}/`)
  );
  if (forbiddenPackage) return { kind: "forbidden", name: specifier };
  let base: string | null = null;
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else if (specifier.startsWith("@mobile/")) {
    base = join(SRC_ROOT, specifier.slice("@mobile/".length));
  } else if (specifier === "@seedbook/domain") base = DOMAIN_SRC;
  else if (specifier.startsWith("@seedbook/domain/")) {
    base = join(DOMAIN_SRC, specifier.slice("@seedbook/domain/".length));
  }
  if (base === null) return null;
  const path = resolveFile(base);
  if (path === null) throw new Error(`${relative(REPO_ROOT, from)}: "${specifier}" 를 찾지 못함`);
  return { kind: "file", path };
}

function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return !rel.startsWith("..");
}

/** 앱 밖(도메인 패키지 제외) 이거나 테스트 전용인 파일. */
function isOffLimits(path: string): boolean {
  if (isInside(path, DOMAIN_SRC)) return false;
  if (!isInside(path, SRC_ROOT)) return true;
  const rel = relative(SRC_ROOT, path);
  return TEST_ONLY.some((p) => rel.startsWith(p));
}

/** 클라이언트 파일에서 너비 우선으로 따라가며, 서버 쪽에 닿는 첫 경로를 모은다. */
function findServerImports(roots: string[]): string[] {
  const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
  const queue = [...roots];
  const violations: string[] = [];
  const chain = (file: string) => {
    const files: string[] = [];
    for (let f: string | null | undefined = file; f; f = parent.get(f)) {
      files.unshift(relative(REPO_ROOT, f));
    }
    return files.join(" → ");
  };

  for (let file = queue.shift(); file; file = queue.shift()) {
    for (const specifier of importSpecifiers(file)) {
      const target = resolveImport(specifier, file);
      if (target === null) continue;
      if (target.kind === "forbidden") {
        violations.push(`${chain(file)} → ${target.name}`);
      } else if (isOffLimits(target.path)) {
        violations.push(`${chain(file)} → ${relative(REPO_ROOT, target.path)}`);
      } else if (!parent.has(target.path)) {
        parent.set(target.path, file);
        queue.push(target.path);
      }
    }
  }
  return violations;
}

describe("app imports", () => {
  it("never reach the web server, @seedbook/database or node modules", () => {
    const roots = sourceFiles(SRC_ROOT).filter((file) => !isOffLimits(file));

    expect(findServerImports(roots)).toEqual([]);
  });
});
