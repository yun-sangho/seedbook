import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { APP_SECTIONS, decideMobileRoute } from "@mobile/lib/device";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "..");

/** Next 가 그리는 최상위 경로 이름 (route group `(site)` 은 주소에 나오지 않아 그 안을 본다). */
function nextTopLevelSegments(dir = resolve(WEB_ROOT, "app")): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      entry.name.startsWith("(") ? nextTopLevelSegments(resolve(dir, entry.name)) : [entry.name]
    );
}

/** public/ 의 최상위 이름 (확장자 없는 폴더·파일은 앱 경로와 겹칠 수 있다). */
function publicTopLevelNames(): string[] {
  return readdirSync(resolve(WEB_ROOT, "public")).map((name) => name.replace(/\..*$/, ""));
}

describe("app routes and the site share one domain", () => {
  const appSegments = APP_SECTIONS.map((section) => section.slice(1));

  it("keeps Next pages off the app section names (the proxy would serve the app there)", () => {
    expect(nextTopLevelSegments().filter((name) => appSegments.includes(name))).toEqual([]);
  });

  it("keeps public files off the app section names", () => {
    expect(publicTopLevelNames().filter((name) => appSegments.includes(name))).toEqual([]);
  });

  it.each(nextTopLevelSegments().filter((name) => !["api", "dev"].includes(name)))(
    "leaves the site page /%s to Next on a phone",
    (name) => {
      expect(decideMobileRoute(`/${name}`, "mobile")).toEqual({ type: "pass" });
    }
  );
});
