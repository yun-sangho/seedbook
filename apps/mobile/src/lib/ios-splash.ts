import screens from "./ios-splash-screens.json" with { type: "json" };

/**
 * iOS 홈 화면 앱 스플래시(`apple-touch-startup-image`) 목록.
 *
 * iOS 는 media query 가 기기 화면과 정확히 일치하는 이미지만 쓰고, 없으면 흰
 * 화면을 띄운다. 해상도 목록은 `ios-splash-screens.json` 에 두고 이미지 생성
 * 스크립트(루트 `scripts/generate-brand-icons.mjs`) 와 공유한다. 모바일 트리는 세로
 * 화면 전용이라 portrait 만 둔다. 라이트·다크(`-dark`) 두 장씩.
 */
export interface IosStartupImage {
  url: string;
  media: string;
}

export function iosStartupImages(): IosStartupImage[] {
  return screens.flatMap(({ width, height, ratio }) => {
    const name = `/splash/apple-splash-${width * ratio}x${height * ratio}`;
    const screen =
      `screen and (device-width: ${width}px) and (device-height: ${height}px)` +
      ` and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
    // 다크 모드 기기에서 흰 화면이 번쩍이지 않게 색 모드마다 따로 둔다.
    return [
      { url: `${name}.png`, media: `${screen} and (prefers-color-scheme: light)` },
      { url: `${name}-dark.png`, media: `${screen} and (prefers-color-scheme: dark)` },
    ];
  });
}
