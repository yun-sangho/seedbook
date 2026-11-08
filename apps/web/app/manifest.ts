import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Seedbook - 자산 관리",
    short_name: "Seedbook",
    description: "개인 자산 계획 및 투자 관리 도구",
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
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
    scope: "/",
    // 설치한 앱은 랜딩 대신 바로 투자 화면으로 연다 (모바일이면 middleware 가 SEED 화면으로 보냄).
    start_url: "/assets/investments",
  };
}
