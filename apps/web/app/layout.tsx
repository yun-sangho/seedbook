import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { SerwistProvider } from "@serwist/next/react";
import { ThemeProvider } from "@web/components/theme-provider";
import { CSP_NONCE_HEADER } from "@web/lib/csp";
import { cn } from "@web/lib/utils";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seedbook - 자산 관리",
  description: "투자 계좌 · 포트폴리오 · 리밸런싱 관리 도구",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts 가 요청마다 만든 CSP nonce. next-themes 의 인라인 스크립트에 붙인다.
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
  return (
    <html lang="ko" suppressHydrationWarning>
      <head />
      <body className={cn(geist.className, "w-screen h-screen")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {/* PWA 서비스 워커 (serwist.config.js 가 prod 빌드에서 만든다). dev 에는 sw.js 가 없어 끈다.
              온라인 복귀 시 자동 새로고침은 작성 중인 폼을 날릴 수 있어 끈다. */}
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV === "development"}
            reloadOnOnline={false}
          >
            {children}
          </SerwistProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
