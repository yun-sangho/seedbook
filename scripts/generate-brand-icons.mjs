/**
 * 서비스 아이콘·스플래시·로고 생성기. 원본은 apps/web/brand/mark.svg (씨앗에서 싹) 하나이고,
 * 웹(favicon·PWA·iOS 홈 화면·스플래시·사이트 로고)과 네이티브 앱(iOS AppIcon·LaunchScreen,
 * Android 런처·적응형·스플래시)을 모두 만든다. 마크가 바뀌면 다시 실행:
 *
 *   pnpm brand:icons
 *
 * 개발용 앱 Seedbook Dev 의 아이콘(같은 그림 + "DEV" 표시)도 만든다 — iOS `AppIconDev` (Dev 빌드 구성),
 * Android `src/dev/res` (dev 빌드 타입).
 *
 * 같은 원본이면 같은 파일이 나온다. sharp 는 web 의 next 의존성으로 들어와 있어 그 기준으로
 * resolve 한다. (@capacitor/assets 는 쓰지 않는다 — 출력 경로·비율을 웹과 함께 맞추기 어렵고
 * 의존성만 늘어서.)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRAND_BACKGROUND,
  composeSplashSvg,
  composeSvg,
  encodeIco,
  withDevBadge,
} from "./brand-icons-lib.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "apps/web");
const mobileDir = path.join(rootDir, "apps/mobile");
const require = createRequire(path.join(webDir, "package.json"));
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const MARK = readFileSync(path.join(webDir, "brand/mark.svg"), "utf8");

/** 앱 아이콘 타일: 그림 반지름 ~37 — PWA maskable 안전 원(40) 안. */
const TILE_SCALE = 1.12;
/** favicon(16·32): 작게 보이므로 타일을 더 채운다. */
const FAVICON_SCALE = 1.3;
/** 모서리를 직접 둥글리는 타일(favicon, PWA any, Android 구형 런처)의 반지름 (100 기준). */
const TILE_RADIUS = 22;
/** Android 적응형 전경: 108dp 중 가운데 72dp 가 보인다 → 타일과 같은 크기가 되도록 줄인다. */
const ADAPTIVE_SCALE = (TILE_SCALE * 72) / 108;
/** 스플래시 배경·글자색 (SEED bg.layerDefault·fg.neutral). 다크 배경은 iOS AppBackground.colorset 다크와 같다. */
const SPLASH_LIGHT = { background: "#ffffff", wordmarkColor: "#1a1c20" };
const SPLASH_DARK = { background: "#16171b", wordmarkColor: "#f3f4f5" };

function write(dest, data) {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, data);
  console.log("wrote", path.relative(rootDir, dest));
}

/** 100×100 SVG 를 size×size PNG 로. opaque 면 알파 채널을 뺀다 (App Store 아이콘). */
async function rasterize(svg, size, { opaque = false } = {}) {
  let image = sharp(Buffer.from(svg), { density: (72 * size) / 100 }).resize(size, size);
  if (opaque) image = image.flatten({ background: BRAND_BACKGROUND }).removeAlpha();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * width×height 스플래시 PNG: 단색 배경 가운데에 마크와 "Seedbook" (`composeSplashSvg`). unit 은 그 화면에서
 * 보이는 짧은 변(px) — 기본은 이미지의 짧은 변.
 */
async function splash(width, height, theme, unit = Math.min(width, height)) {
  const svg = composeSplashSvg(MARK, { width, height, unit, ...theme });
  return sharp(Buffer.from(svg))
    .flatten({ background: theme.background })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const tile = composeSvg(MARK, { scale: TILE_SCALE, background: BRAND_BACKGROUND });
const roundedTile = composeSvg(MARK, {
  scale: TILE_SCALE,
  background: BRAND_BACKGROUND,
  radius: TILE_RADIUS,
});
const circleTile = composeSvg(MARK, {
  scale: TILE_SCALE,
  background: BRAND_BACKGROUND,
  radius: 50,
});
const faviconTile = composeSvg(MARK, {
  scale: FAVICON_SCALE,
  background: BRAND_BACKGROUND,
  radius: TILE_RADIUS,
});

// ── 웹 ─────────────────────────────────────────────────────────────────────────
// favicon: SVG (지원 브라우저) + ICO 16·32·48 (나머지).
write(path.join(webDir, "app/icon.svg"), faviconTile);
write(
  path.join(webDir, "app/favicon.ico"),
  encodeIco(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({ size, png: await rasterize(faviconTile, size) }))
    )
  )
);
// iOS 홈 화면: 투명 영역을 검게 칠하므로 불투명, 모서리는 iOS 가 자른다.
write(path.join(webDir, "app/apple-icon.png"), await rasterize(tile, 180, { opaque: true }));
for (const size of [192, 512]) {
  // purpose any: 그대로 보이므로 모서리를 둥글린 타일.
  write(
    path.join(webDir, `public/android-chrome-${size}x${size}.png`),
    await rasterize(roundedTile, size)
  );
  // purpose maskable: 런처가 자르므로 꽉 찬 타일.
  write(
    path.join(webDir, `public/maskable-${size}x${size}.png`),
    await rasterize(tile, size, { opaque: true })
  );
}
// 사이트 헤더 로고: 투명 배경, 그림에 바짝 맞춘 viewBox.
write(path.join(webDir, "public/logo.svg"), composeSvg(MARK, { scale: 1, viewBox: "18 18 64 64" }));
// iOS PWA 스플래시: 라이트·다크 (`-dark`, src/lib/ios-splash.ts 가 prefers-color-scheme 로 고른다).
const screens = JSON.parse(
  readFileSync(path.join(rootDir, "apps/mobile/src/lib/ios-splash-screens.json"), "utf8")
);
for (const { width, height, ratio } of screens) {
  const w = width * ratio;
  const h = height * ratio;
  write(
    path.join(webDir, `public/splash/apple-splash-${w}x${h}.png`),
    await splash(w, h, SPLASH_LIGHT)
  );
  write(
    path.join(webDir, `public/splash/apple-splash-${w}x${h}-dark.png`),
    await splash(w, h, SPLASH_DARK)
  );
}

// ── iOS 앱 ─────────────────────────────────────────────────────────────────────
const IOS_ASSETS = path.join(mobileDir, "ios/App/App/Assets.xcassets");
write(
  path.join(IOS_ASSETS, "AppIcon.appiconset/AppIcon-512@2x.png"),
  await rasterize(tile, 1024, { opaque: true })
);
// Seedbook Dev (Dev 빌드 구성의 ASSETCATALOG_COMPILER_APPICON_NAME).
write(
  path.join(IOS_ASSETS, "AppIconDev.appiconset/AppIcon-512@2x.png"),
  await rasterize(withDevBadge(tile, { centerY: 80, scale: 1 }), 1024, { opaque: true })
);
write(
  path.join(IOS_ASSETS, "AppIconDev.appiconset/Contents.json"),
  readFileSync(path.join(IOS_ASSETS, "AppIcon.appiconset/Contents.json"))
);
// LaunchScreen: 정사각 2732 를 화면 높이에 맞춰 가운데를 자른다 (scaleAspectFill). 폰(390×844pt)에서 보이는
// 폭은 2732 × 390/844 — 그 폭을 기준으로 마크·글자 크기를 정한다.
const IOS_LAUNCH_VISIBLE_WIDTH = Math.round((2732 * 390) / 844);
for (const name of ["splash-2732x2732", "splash-2732x2732-1", "splash-2732x2732-2"]) {
  write(
    path.join(IOS_ASSETS, `Splash.imageset/${name}.png`),
    await splash(2732, 2732, SPLASH_LIGHT, IOS_LAUNCH_VISIBLE_WIDTH)
  );
  write(
    path.join(IOS_ASSETS, `Splash.imageset/${name}-dark.png`),
    await splash(2732, 2732, SPLASH_DARK, IOS_LAUNCH_VISIBLE_WIDTH)
  );
}

// ── Android 앱 ─────────────────────────────────────────────────────────────────
const RES = path.join(mobileDir, "android/app/src/main/res");
const DENSITIES = [
  { name: "mdpi", launcher: 48, foreground: 108 },
  { name: "hdpi", launcher: 72, foreground: 162 },
  { name: "xhdpi", launcher: 96, foreground: 216 },
  { name: "xxhdpi", launcher: 144, foreground: 324 },
  { name: "xxxhdpi", launcher: 192, foreground: 432 },
];
const adaptiveForeground = composeSvg(MARK, { scale: ADAPTIVE_SCALE });
for (const { name, launcher, foreground } of DENSITIES) {
  // Android 7 이하 런처: 둥근 사각·원 타일 그대로.
  write(path.join(RES, `mipmap-${name}/ic_launcher.png`), await rasterize(roundedTile, launcher));
  write(
    path.join(RES, `mipmap-${name}/ic_launcher_round.png`),
    await rasterize(circleTile, launcher)
  );
  // 적응형 전경 (배경은 values/ic_launcher_background.xml 의 색).
  write(
    path.join(RES, `mipmap-${name}/ic_launcher_foreground.png`),
    await rasterize(adaptiveForeground, foreground)
  );
}
// Seedbook Dev (dev 빌드 타입): 같은 이름의 런처 아이콘을 src/dev/res 가 덮는다. 적응형 전경은 보이는 원
// (반지름 ~30) 안에 들도록 표시를 줄여 얹는다.
const DEV_RES = path.join(mobileDir, "android/app/src/dev/res");
const devBadge = { centerY: 80, scale: 1 };
for (const { name, launcher, foreground } of DENSITIES) {
  write(
    path.join(DEV_RES, `mipmap-${name}/ic_launcher.png`),
    await rasterize(withDevBadge(roundedTile, devBadge), launcher)
  );
  write(
    path.join(DEV_RES, `mipmap-${name}/ic_launcher_round.png`),
    await rasterize(withDevBadge(circleTile, devBadge), launcher)
  );
  write(
    path.join(DEV_RES, `mipmap-${name}/ic_launcher_foreground.png`),
    await rasterize(withDevBadge(adaptiveForeground, { centerY: 70, scale: 0.6 }), foreground)
  );
}
write(
  path.join(RES, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- scripts/generate-brand-icons.mjs 가 만든다 (BRAND_BACKGROUND). -->
<resources>
    <color name="ic_launcher_background">${BRAND_BACKGROUND}</color>
</resources>
`
);
const ANDROID_SPLASHES = [
  ["drawable", 480, 320],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
];
for (const [dir, width, height] of ANDROID_SPLASHES) {
  write(path.join(RES, `${dir}/splash.png`), await splash(width, height, SPLASH_LIGHT));
}
