import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 개발용 앱 Seedbook Dev (iOS `Dev` 빌드 구성, Android `dev` 빌드 타입) 는 출시 앱과 번들 ID·이름·아이콘,
 * 그리고 로컬 dev 서버용 http 예외만 다르다. 출시 앱 구성에 그 예외가 새지 않고, Dev 의 Info.plist 가
 * 출시 Info.plist 에서 갈라지지 않게 지킨다 (apps/mobile/README.md "Seedbook Dev").
 */
const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const DEV_ONLY_PLIST_BLOCK = `	<!-- Seedbook Dev 전용: 같은 Wi-Fi 의 맥 dev 서버(http://<LAN IP>:<포트>)에 붙는다. 출시 앱(Info.plist)에는 없다. -->
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>NSLocalNetworkUsageDescription</key>
	<string>개발용 앱이 같은 Wi-Fi 의 개발 서버에 연결합니다.</string>
`;

/** pbxproj 의 App 타깃 빌드 구성들 (`PRODUCT_BUNDLE_IDENTIFIER` 가 있는 블록) 을 이름별로. */
function appTargetConfigurations(pbxproj: string): Map<string, string> {
  const configs = new Map<string, string>();
  for (const match of pbxproj.matchAll(
    /buildSettings = \{([\s\S]*?)\n\t\t\t\};\n\t\t\tname = (\w+);/g
  )) {
    const [, settings, name] = match;
    if (settings && name && settings.includes("PRODUCT_BUNDLE_IDENTIFIER")) configs.set(name, settings);
  }
  return configs;
}

describe("iOS Seedbook Dev", () => {
  const configs = appTargetConfigurations(read("ios/App/App.xcodeproj/project.pbxproj"));

  it("has Debug, Release and Dev configurations for the app target", () => {
    expect([...configs.keys()].sort()).toEqual(["Debug", "Dev", "Release"]);
  });

  it("builds Dev as a separate app with its own name, icon and Info.plist", () => {
    const dev = configs.get("Dev") ?? "";
    expect(dev).toContain("PRODUCT_BUNDLE_IDENTIFIER = ing.boogie.seedbook.dev;");
    expect(dev).toContain("ASSETCATALOG_COMPILER_APPICON_NAME = AppIconDev;");
    expect(dev).toContain('INFOPLIST_FILE = "App/Info-Dev.plist";');
    expect(dev).toContain("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;");
  });

  it("keeps the release app on the release bundle id, icon and Info.plist", () => {
    for (const name of ["Debug", "Release"]) {
      const settings = configs.get(name) ?? "";
      expect(settings).toContain("PRODUCT_BUNDLE_IDENTIFIER = ing.boogie.seedbook;");
      expect(settings).toContain("ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;");
      expect(settings).toContain("INFOPLIST_FILE = App/Info.plist;");
    }
  });

  it("has no local network exception in the release Info.plist", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).not.toContain("NSAppTransportSecurity");
    expect(plist).not.toContain("NSLocalNetworkUsageDescription");
  });

  it("derives Info-Dev.plist from Info.plist (only the name and the dev block differ)", () => {
    const dev = read("ios/App/App/Info-Dev.plist");
    expect(dev).toContain(DEV_ONLY_PLIST_BLOCK);
    const restored = dev
      .replace(DEV_ONLY_PLIST_BLOCK, "")
      .replace("<string>Seedbook Dev</string>", "<string>Seedbook</string>");
    expect(restored).toBe(read("ios/App/App/Info.plist"));
  });
});

describe("Android Seedbook Dev", () => {
  it("adds a dev build type installed next to the release app", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toMatch(/dev \{\s*initWith debug\s*applicationIdSuffix "\.dev"/);
  });

  it("allows cleartext only in the dev source set", () => {
    expect(read("android/app/src/main/AndroidManifest.xml")).not.toMatch(
      /networkSecurityConfig|usesCleartextTraffic/
    );
    expect(read("android/app/src/dev/AndroidManifest.xml")).toContain(
      'android:networkSecurityConfig="@xml/network_security_config"'
    );
  });

  it("names the dev app Seedbook Dev", () => {
    expect(read("android/app/src/dev/res/values/strings.xml")).toContain(
      '<string name="app_name">Seedbook Dev</string>'
    );
  });
});
