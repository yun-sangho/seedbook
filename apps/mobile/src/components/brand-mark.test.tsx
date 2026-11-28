import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";

// 마크 원본은 apps/web/brand/mark.svg 하나다 (아이콘·스플래시 생성기도 이 파일을 쓴다). 앱 번들은 웹 파일을
// import 하지 않으므로 컴포넌트에 같은 그림을 옮겨 두고, 어긋나지 않게 여기서 비교한다.
const markSvg = readFileSync(resolve(__dirname, "../../../web/brand/mark.svg"), "utf8");

/** 그림 요소만 (태그·속성 순서대로) 뽑아 비교한다. 주석·title·공백·속성 표기(camelCase)는 무시한다. */
function shapes(svg: string): string[] {
  const body = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<title>[\s\S]*?<\/title>/g, "");
  return [...body.matchAll(/<(g|ellipse|path)\s([^>]*?)\/?>/g)].map(([, tag, attrs]) => {
    const normalized = [...(attrs ?? "").matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, name, value]) => `${(name ?? "").replace(/-/g, "").toLowerCase()}=${value}`)
      .join(" ");
    return `${tag} ${normalized}`;
  });
}

describe("BrandMark", () => {
  it("draws the same seed-and-sprout as the brand source mark", () => {
    const rendered = renderToStaticMarkup(<BrandMark size={96} />);

    expect(shapes(rendered)).toEqual(shapes(markSvg));
  });

  it("is decorative by default so screen readers read the app name next to it", () => {
    const rendered = renderToStaticMarkup(<BrandMark size={96} />);

    expect(rendered).toContain('aria-hidden="true"');
  });
});
