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
