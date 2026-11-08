/**
 * PWA 아이콘·스플래시 생성기. 원본 로고(public/android-chrome-512x512.png, 투명
 * 배경)를 흰 배경에 얹어 플랫폼별 이미지를 만든다. 로고가 바뀌면 다시 실행:
 *
 *   node apps/web/scripts/generate-pwa-images.mjs
 *
 * sharp 는 next 의 의존성으로 들어와 있어 next 기준으로 resolve 한다.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(webDir, "public");
const SOURCE = path.join(publicDir, "android-chrome-512x512.png");
const BACKGROUND = "#ffffff";

/** 정사각 캔버스 가운데에 로고를 logoSize 로 얹는다. */
async function compose(width, height, logoSize, dest) {
  const logo = await sharp(SOURCE).resize(logoSize, logoSize).toBuffer();
  await sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite([
      {
        input: logo,
        left: Math.round((width - logoSize) / 2),
        top: Math.round((height - logoSize) / 2),
      },
    ])
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log("wrote", path.relative(webDir, dest));
}

// Android maskable: 안전 영역(중앙 80% 원) 안에 들어가도록 62%.
for (const size of [192, 512]) {
  await compose(
    size,
    size,
    Math.round(size * 0.62),
    path.join(publicDir, `maskable-${size}x${size}.png`)
  );
}

// iOS 홈 화면 아이콘: iOS 는 투명 영역을 검게 칠하므로 불투명 배경 필수.
// 모서리만 둥글게 잘리므로 maskable 보다 크게(78%).
await compose(180, 180, Math.round(180 * 0.78), path.join(webDir, "app/apple-icon.png"));

// iOS 스플래시: 짧은 변의 32% 크기 로고.
const screens = JSON.parse(readFileSync(path.join(webDir, "lib/ios-splash-screens.json"), "utf8"));
mkdirSync(path.join(publicDir, "splash"), { recursive: true });
for (const { width, height, ratio } of screens) {
  const w = width * ratio;
  const h = height * ratio;
  await compose(
    w,
    h,
    Math.round(w * 0.32),
    path.join(publicDir, "splash", `apple-splash-${w}x${h}.png`)
  );
}
