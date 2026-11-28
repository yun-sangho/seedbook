import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 클라이언트 코드가 서버 코드를 끌어오지 않는지 지킨다. `/m` 은 앱 번들(Vite SPA)로 옮겨지므로
 * 클라이언트에서 닿는 모듈은 DB·drizzle·node 모듈 없이 돌아야 한다. 서버와 같이 쓰는 순수 로직은
 * `@seedbook/domain` 에 둔다. 타입 import 도 센다 — 타입만 가져와도 그 파일이 서버 쪽에 묶인다.
 *
 * 직접 import 는 biome `noRestrictedImports` (biome.json overrides) 가 편집기에서 먼저 잡고, 이
 * 테스트는 클라이언트 파일에서 import 를 따라가며 간접으로 닿는 것까지 본다.
 */
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "../..");
const DOMAIN_SRC = join(REPO_ROOT, "packages/domain/src");
const CLIENT_DIRS = ["app", "components", "features", "hooks", "lib", "types", "utils"];

/** 클라이언트 트리 안이지만 서버에서만 도는 곳. 여기서 시작하지 않고, 클라이언트가 닿으면 위반이다. */
const SERVER_ONLY = [
  "app/api/", // 라우트 핸들러
  "app/(site)/", // 소개·약관 페이지 (서버 컴포넌트)
  "app/layout.tsx",
  "app/manifest.ts",
  "app/sw.ts", // 서비스 워커 (serwist 가 따로 빌드)
  "lib/auth.ts",
  "lib/auth-server.ts",
  "lib/auth-privacy.ts",
  "lib/apple-auth.ts",
  "lib/stock-quotes/", // 서버가 외부 시세 API 를 부른다
  "lib/native/device-db/testing/", // node:sqlite 테스트 드라이버
  "server/",
];

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
  if (specifier === "@seedbook/database" || specifier.startsWith("@seedbook/database/")) {
    return { kind: "forbidden", name: specifier };
  }
  let base: string | null = null;
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else if (specifier.startsWith("@web/")) base = join(WEB_ROOT, specifier.slice("@web/".length));
  else if (specifier === "@seedbook/domain") base = DOMAIN_SRC;
  else if (specifier.startsWith("@seedbook/domain/")) {
    base = join(DOMAIN_SRC, specifier.slice("@seedbook/domain/".length));
  }
  if (base === null) return null;
  const path = resolveFile(base);
  if (path === null) throw new Error(`${relative(REPO_ROOT, from)}: "${specifier}" 를 찾지 못함`);
  return { kind: "file", path };
}

function isServerOnly(path: string): boolean {
  const rel = relative(WEB_ROOT, path);
  return !rel.startsWith("..") && SERVER_ONLY.some((p) => rel === p || rel.startsWith(p));
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
      } else if (isServerOnly(target.path)) {
        violations.push(`${chain(file)} → ${relative(REPO_ROOT, target.path)}`);
      } else if (!parent.has(target.path)) {
        parent.set(target.path, file);
        queue.push(target.path);
      }
    }
  }
  return violations;
}

describe("client imports", () => {
  it("never reach server code, @seedbook/database or node modules", () => {
    const roots = CLIENT_DIRS.flatMap((dir) => sourceFiles(join(WEB_ROOT, dir))).filter(
      (file) => !isServerOnly(file)
    );

    expect(findServerImports(roots)).toEqual([]);
  });
});
