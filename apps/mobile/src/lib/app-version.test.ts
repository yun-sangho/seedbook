import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 앱 버전은 하나다 — `package.json` `version` (번들에 들어가 업데이트 게이트가 쓴다, `lib/app-update.ts`) 이
 * iOS `MARKETING_VERSION`·Android `versionName` (스토어에 보이는 버전) 과 같아야 한다. 릴리스는 fastlane 이
 * package.json 값을 넣고 (`fastlane/Fastfile`), 프로젝트 파일의 값은 로컬 빌드 기본값이다.
 */
const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const packageVersion: string = JSON.parse(read("package.json")).version;

describe("app version", () => {
  it("matches the iOS marketing version", () => {
    const versions = [
      ...read("ios/App/App.xcodeproj/project.pbxproj").matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ].map((match) => match[1]);

    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([packageVersion]));
  });

  it("matches the Android version name (local default; release builds get it from fastlane)", () => {
    expect(read("android/app/build.gradle")).toContain(
      `findProperty('SEEDBOOK_VERSION_NAME') ?: '${packageVersion}'`
    );
  });
});
