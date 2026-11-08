import { redirect } from "next/navigation";

/** 데스크탑 `/assets` 는 투자 화면이 첫 화면이다 (서비스 범위: 투자 · 포트폴리오 · 리밸런싱). */
export default function AssetsPage() {
  redirect("/assets/investments");
}
