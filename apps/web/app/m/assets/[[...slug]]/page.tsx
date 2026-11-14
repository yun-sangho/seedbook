/**
 * 모바일 화면은 레이아웃의 Stackflow 스택(`app/m/_stack`)이 URL 을 보고 직접 그린다.
 * 이 catch-all 은 `/assets/...` 를 직접 열거나 새로고침했을 때 Next 가 404 를 내지 않도록
 * 경로만 받아준다. 지원 경로 판별은 proxy (`lib/device.ts`) 가 한다.
 */
export default function MobileAssetsPage() {
  return null;
}
