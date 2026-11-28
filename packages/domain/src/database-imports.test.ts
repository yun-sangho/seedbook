import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * database 패키지가 import 하는 domain 모듈은 다른 모듈을 import 하지 않는다.
 *
 * - database 는 `tsc` (nodenext) 로 CommonJS dist 를 만들고, 그 dist 를 운영 stock-crawler 가 node 로
 *   실행한다. node 는 domain 의 `.ts` 를 타입만 지우고 바로 읽지만 확장자 없는 상대 import 는 못 푼다.
 * - nodenext 타입 검사도 domain 파일 안의 확장자 없는 상대 import 를 오류로 본다.
 *
 * 그래서 database 쪽에서 쓰는 것은 import 없는 파일(`kst.ts` 등)로 두고, 여러 파일에 걸친 것은
 * database 에 둔다 (예: 약관 검증 `packages/database/src/legal/validate.ts`).
 */
const DOMAIN_SRC = new URL(".", import.meta.url).pathname;
const DATABASE_SRC = join(DOMAIN_SRC, "../../database/src");
const DOMAIN_IMPORT = /\bfrom\s+["']@seedbook\/domain(\/[^"']+)?["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function domainImportsOfDatabase(): Map<string, string[]> {
  const importers = new Map<string, string[]>();
  for (const file of sourceFiles(DATABASE_SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(DOMAIN_IMPORT)) {
      const subpath = match[1] ?? "/index";
      const list = importers.get(subpath) ?? [];
      list.push(relative(DATABASE_SRC, file));
      importers.set(subpath, list);
    }
  }
  return importers;
}

describe("domain modules imported by packages/database", () => {
  const imports = domainImportsOfDatabase();

  it("are found (the scan reads database sources)", () => {
    expect(imports.has("/kst")).toBe(true);
  });

  it.each([...imports])("@seedbook/domain%s has no imports of its own", (subpath, importers) => {
    const file = join(DOMAIN_SRC, `${subpath}.ts`);
    expect(existsSync(file), `${subpath} (${importers.join(", ")})`).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\bfrom\s+["']|^\s*import\s+["']|\brequire\(|\bimport\(/m);
  });
});
