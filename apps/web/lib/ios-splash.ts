import screens from "./ios-splash-screens.json";

/**
 * iOS 홈 화면 앱 스플래시(`apple-touch-startup-image`) 목록.
 *
 * iOS 는 media query 가 기기 화면과 정확히 일치하는 이미지만 쓰고, 없으면 흰
 * 화면을 띄운다. 해상도 목록은 `ios-splash-screens.json` 에 두고 이미지 생성
 * 스크립트(`scripts/generate-pwa-images.mjs`) 와 공유한다. 모바일 트리는 세로
 * 화면 전용이라 portrait 만 둔다.
 */
export interface IosStartupImage {
  url: string;
  media: string;
}

export function iosStartupImages(): IosStartupImage[] {
  return screens.map(({ width, height, ratio }) => ({
    url: `/splash/apple-splash-${width * ratio}x${height * ratio}.png`,
    media:
      `screen and (device-width: ${width}px) and (device-height: ${height}px)` +
      ` and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }));
}
