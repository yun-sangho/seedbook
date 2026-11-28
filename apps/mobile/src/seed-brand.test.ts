import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const SEED_BASE_CSS = readFileSync(require.resolve("@seed-design/css/base.css"), "utf8");
const BRAND_CSS = readFileSync(path.join(__dirname, "seed-brand.css"), "utf8");

/** `--seed-color-{fg,bg,stroke}-brand…` 이름들 (`fg-on-brand-solid` 같은 브랜드 위 글자색은 빼고). */
function brandTokenNames(css: string): string[] {
  return [...new Set(css.match(/--seed-color-(?:fg|bg|stroke)-brand[a-z-]*(?=:)/g) ?? [])].sort();
}

/** 선택자에 `marker` 가 들어간 첫 규칙 블록의 본문. */
function ruleBody(css: string, marker: string): string {
  const start = css.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("seed-brand.css", () => {
  const seedTokens = brandTokenNames(SEED_BASE_CSS);

  it("finds SEED brand tokens to remap", () => {
    expect(seedTokens).toContain("--seed-color-bg-brand-solid");
    expect(seedTokens).toContain("--seed-color-fg-brand");
  });

  it("remaps every SEED brand token in light mode", () => {
    const body = ruleBody(BRAND_CSS, '[data-seed-user-color-scheme="light"]');

    expect(brandTokenNames(body)).toEqual(seedTokens);
  });

  it("remaps every SEED brand token in dark mode", () => {
    const body = ruleBody(BRAND_CSS, '[data-seed-user-color-scheme="dark"]');

    expect(brandTokenNames(body)).toEqual(seedTokens);
  });
});
