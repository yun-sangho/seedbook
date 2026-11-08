import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Seedbook - 자산 관리",
    short_name: "Seedbook",
    description: "투자 계좌 · 포트폴리오 · 리밸런싱 관리 도구",
    lang: "ko",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android 적응형 아이콘용. 흰 배경 위 로고를 62% 로 줄여 안전 영역(중앙 80% 원)
      // 안에 넣었다. 런처가 원·둥근사각 등으로 잘라도 가지 끝이 잘리지 않는다.
      {
        src: "/maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // 홈 화면 아이콘 길게 누르기 메뉴. 모바일 SEED 트리가 지원하는 경로만 둔다
    // (그 외 경로는 모바일에서 홈으로 redirect 됨 — lib/device.ts).
    shortcuts: [
      {
        name: "계좌",
        url: "/assets/investments",
        icons: [{ src: "/maskable-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "포트폴리오",
        url: "/assets/portfolio",
        icons: [{ src: "/maskable-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    categories: ["finance"],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
    scope: "/",
    // 설치한 앱은 랜딩 대신 바로 홈(총 평가금액·통계)으로 연다. 모바일이면 middleware 가
    // SEED 홈으로 rewrite 하고, 데스크탑에서는 같은 URL 이 자산 개요 화면이다.
    start_url: "/assets",
  };
}
