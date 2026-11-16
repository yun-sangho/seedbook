"use client";

import { Button } from "@web/components/ui/button";
import { setViewOverride } from "@web/lib/view-override";
import { Smartphone } from "lucide-react";

/**
 * 데스크탑 소개 페이지의 CTA. 앱 화면은 모바일 UI 뿐이라 로그인 대신 휴대폰 이용을 안내하고,
 * 원하면 이 브라우저에서 모바일 화면으로 열 수 있게 한다 (`seedbook.view=mobile` 쿠키).
 */
export function LandingMobileOnly({ host }: { host: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-4 py-2 text-sm">
        <Smartphone className="w-4 h-4 text-primary" />
        휴대폰 브라우저에서 <span className="font-semibold">{host}</span> 에 접속해 시작하세요
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => {
          setViewOverride("mobile");
          window.location.href = "/assets";
        }}
      >
        이 브라우저에서 모바일 화면으로 열기
      </Button>
    </div>
  );
}
