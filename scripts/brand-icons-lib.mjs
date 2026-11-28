/**
 * 브랜드 아이콘 생성기(scripts/generate-brand-icons.mjs)의 순수 로직. 테스트:
 * apps/web/test/brand/brand-icons-lib.test.ts
 */

/** 아이콘 타일 배경 (식물 2D 아바타 배경과 같은 민트). */
export const BRAND_BACKGROUND = "#E2F4DF";

/** 원본 마크 SVG(viewBox 0 0 100 100)에서 루트 안쪽 그림만 꺼낸다. 주석은 뺀다. */
export function markInner(source) {
  if (!/viewBox="0 0 100 100"/.test(source)) {
    throw new Error('mark svg must use viewBox="0 0 100 100"');
  }
  const open = source.indexOf(">", source.indexOf("<svg")) + 1;
  const close = source.lastIndexOf("</svg>");
  return source
    .slice(open, close)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

/**
 * 마크를 가운데 기준 scale 배로 얹은 100×100 SVG. background 가 없으면 투명.
 * radius 는 100 기준 모서리 반지름, viewBox 로 로고처럼 바짝 자를 수 있다.
 *
 * @param {string} source
 * @param {{ scale: number, background?: string, radius?: number, viewBox?: string }} options
 */
export function composeSvg(source, { scale, background, radius = 0, viewBox = "0 0 100 100" }) {
  const rect = background
    ? `<rect width="100" height="100" rx="${radius}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><title>Seedbook</title>${rect}<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${markInner(source)}</g></svg>\n`;
}

/** 개발용 앱(Seedbook Dev) 아이콘 표시의 색. 출시 앱과 나란히 있어도 한눈에 가른다. */
export const DEV_BADGE_FILL = "#1F2328";

/**
 * 100×100 아이콘 SVG 위에 "DEV" 알약 표시를 얹는다 (개발용 앱 아이콘). 표시는 46×18 (100 기준) 을
 * scale 배로, 가운데 (50, centerY) 에 그린다 — 런처가 자르는 영역(Android 적응형의 원 등)에 맞춰 고른다.
 *
 * @param {string} svg composeSvg 결과
 * @param {{ centerY: number, scale: number }} options
 */
export function withDevBadge(svg, { centerY, scale }) {
  const badge =
    `<g transform="translate(50 ${centerY}) scale(${scale})">` +
    `<rect x="-23" y="-9" width="46" height="18" rx="9" fill="${DEV_BADGE_FILL}"/>` +
    `<text x="0" y="4.6" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1" fill="#FFFFFF">DEV</text>` +
    "</g>";
  return svg.replace(/<\/svg>\n?$/, `${badge}</svg>\n`);
}

/** PNG 들을 그대로 담은 ICO (Vista 이후 PNG 항목 지원). images: [{ size, png }] */
export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // 팔레트 없음
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/**
 * 스플래시 마크 상자 크기 (보이는 화면의 짧은 변 대비). 그림 폭은 상자의 ~42% 라 짧은 변의 ~28%
 * (390pt 폰에서 ~110pt). 로그인 화면 마크(components/brand-mark.tsx)와 비슷한 크기로 이어진다.
 */
export const SPLASH_MARK_BOX = 0.67;
/** 마크 그림의 세로 높이가 상자에서 차지하는 비율 (잎 끝 y≈20 ~ 씨앗 아래 y≈81, 가운데 ≈ 50). */
const MARK_SPAN = 0.62;
/** "Seedbook" 글자 크기 (짧은 변 대비, 390pt 폰에서 ~26pt) 와 마크와의 간격. */
const SPLASH_WORDMARK_SIZE = 0.067;
const SPLASH_WORDMARK_GAP = 0.05;

/**
 * 스플래시 한 장(width×height px)의 SVG: 단색 배경 가운데에 마크와 그 아래 "Seedbook". 크기는 `unit`
 * (그 화면에서 실제로 보이는 짧은 변, px) 기준이다 — iOS LaunchScreen 은 정사각 이미지를 화면 높이에 맞춰
 * 자르므로 보이는 폭이 이미지 폭보다 좁다.
 *
 * @param {string} source 마크 원본 SVG
 * @param {{ width: number, height: number, unit: number, background: string, wordmarkColor: string }} options
 */
export function composeSplashSvg(source, { width, height, unit, background, wordmarkColor }) {
  const box = Math.round(unit * SPLASH_MARK_BOX);
  const drawing = box * MARK_SPAN;
  const fontSize = Math.round(unit * SPLASH_WORDMARK_SIZE);
  const gap = unit * SPLASH_WORDMARK_GAP;
  // 그림 + 간격 + 글자 묶음을 세로 가운데에 둔다.
  const blockTop = height / 2 - (drawing + gap + fontSize) / 2;
  const markY = Math.round(blockTop + drawing / 2 - box / 2);
  const markX = Math.round((width - box) / 2);
  const textY = Math.round(blockTop + drawing + gap + fontSize * 0.8);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${background}"/>` +
    `<svg x="${markX}" y="${markY}" width="${box}" height="${box}" viewBox="0 0 100 100">${markInner(source)}</svg>` +
    `<text x="${Math.round(width / 2)}" y="${textY}" text-anchor="middle" font-family="Apple SD Gothic Neo, Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="${(-fontSize * 0.01).toFixed(1)}" fill="${wordmarkColor}">Seedbook</text>` +
    "</svg>\n"
  );
}
