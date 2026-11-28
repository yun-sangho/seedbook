import { cn } from "@web/lib/utils";

/** `public/landing/<name>-{light,dark}.webp` 의 원본 크기 (390×780 화면을 2배율로 캡처). */
const SCREEN_WIDTH = 780;
const SCREEN_HEIGHT = 1560;

export type AppScreenName = "garden-home";

/**
 * 소개 페이지에 넣는 실제 앱 화면 캡처 (dev 사용자 테스트 시나리오). 이 페이지의 색 모드는 시스템
 * 설정을 따르므로 이미지도 같은 media 조건으로 고른다.
 */
export function AppScreen({
  name,
  alt,
  priority = false,
  className,
}: {
  name: AppScreenName;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <picture>
      <source srcSet={`/landing/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/landing/${name}-light.webp`}
        alt={alt}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className={cn("h-auto w-full", className)}
      />
    </picture>
  );
}
