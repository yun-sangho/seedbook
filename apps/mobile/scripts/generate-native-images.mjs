/**
 * 네이티브 앱 아이콘·스플래시 생성기. 웹 PWA 와 같은 원본 로고
 * (apps/web/public/android-chrome-512x512.png, 투명 배경) 를 흰 배경에 얹는다.
 * 비율은 apps/web/scripts/generate-pwa-images.mjs 와 맞춘다. 로고가 바뀌면 다시 실행:
 *
 *   node apps/mobile/scripts/generate-native-images.mjs
 *
 * sharp 는 web 의 next 의존성으로 들어와 있어 그 기준으로 resolve 한다.
 * 원본이 512px 라 1024px iOS 아이콘은 로고만 약간 확대된다 — 벡터 원본이 생기면 교체.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.resolve(mobileDir, "../web");
const require = createRequire(path.join(webDir, "package.json"));
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const SOURCE = path.join(webDir, "public/android-chrome-512x512.png");
const BACKGROUND = "#ffffff";

/** width×height 캔버스 가운데에 로고를 (짧은 변 × ratio) 크기로 얹는다. */
async function compose(relativeDest, width, height, ratio, { opaque = true } = {}) {
  const logoSize = Math.round(Math.min(width, height) * ratio);
  const logo = await sharp(SOURCE).resize(logoSize, logoSize).toBuffer();
  const background = opaque ? BACKGROUND : { r: 0, g: 0, b: 0, alpha: 0 };
  let image = sharp({ create: { width, height, channels: 4, background } }).composite([
    {
      input: logo,
      left: Math.round((width - logoSize) / 2),
      top: Math.round((height - logoSize) / 2),
    },
  ]);
  // App Store 아이콘은 알파 채널이 있으면 거절된다.
  if (opaque) image = image.flatten({ background: BACKGROUND }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(path.join(mobileDir, relativeDest));
  console.log("wrote", relativeDest);
}

// iOS: 모서리만 둥글게 잘리므로 apple-icon 과 같은 78%.
await compose(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  1024,
  1024,
  0.78
);
// iOS 스플래시(LaunchScreen): 정사각 2732 를 화면 높이에 맞춰 자르므로 20% (폰에서 ~170pt).
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await compose(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, 2732, 2732, 0.2);
}

const RES = "android/app/src/main/res";
const DENSITIES = [
  { name: "mdpi", launcher: 48, foreground: 108 },
  { name: "hdpi", launcher: 72, foreground: 162 },
  { name: "xhdpi", launcher: 96, foreground: 216 },
  { name: "xxhdpi", launcher: 144, foreground: 324 },
  { name: "xxxhdpi", launcher: 192, foreground: 432 },
];
for (const { name, launcher, foreground } of DENSITIES) {
  // 구형 런처 아이콘: maskable 과 같은 62%.
  await compose(`${RES}/mipmap-${name}/ic_launcher.png`, launcher, launcher, 0.62);
  await compose(`${RES}/mipmap-${name}/ic_launcher_round.png`, launcher, launcher, 0.62);
  // 적응형 아이콘 전경(108dp 중 안전 영역 66dp): 배경은 values/ic_launcher_background(흰색).
  await compose(`${RES}/mipmap-${name}/ic_launcher_foreground.png`, foreground, foreground, 0.5, {
    opaque: false,
  });
}

const SPLASHES = [
  ["drawable/splash.png", 480, 320],
  ["drawable-land-mdpi/splash.png", 480, 320],
  ["drawable-land-hdpi/splash.png", 800, 480],
  ["drawable-land-xhdpi/splash.png", 1280, 720],
  ["drawable-land-xxhdpi/splash.png", 1600, 960],
  ["drawable-land-xxxhdpi/splash.png", 1920, 1280],
  ["drawable-port-mdpi/splash.png", 320, 480],
  ["drawable-port-hdpi/splash.png", 480, 800],
  ["drawable-port-xhdpi/splash.png", 720, 1280],
  ["drawable-port-xxhdpi/splash.png", 960, 1600],
  ["drawable-port-xxxhdpi/splash.png", 1280, 1920],
];
for (const [dest, width, height] of SPLASHES) {
  await compose(`${RES}/${dest}`, width, height, 0.32);
}
