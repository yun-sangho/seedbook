import "@seed-design/css/base.css";
import { SeedColorScheme } from "@web/components/mobile/seed-color-scheme";

/**
 * 앱 밖 공개 페이지(소개·개인정보처리방침·오프라인). `/m` 처럼 SEED Design CSS 와 색 모드를
 * 이 트리에서만 켠다. body 는 화면 높이에 고정돼 있어 스크롤은 이 래퍼가 맡는다.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SeedColorScheme />
      <div className="bg-bg-layer-default text-fg-neutral h-full w-full overflow-y-auto">
        {children}
      </div>
    </>
  );
}
