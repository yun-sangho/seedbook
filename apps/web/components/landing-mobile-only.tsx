"use client";

import { IconMobileLine } from "@karrotmarket/react-monochrome-icon";
import { VStack } from "@seed-design/react";
import { setViewOverride } from "@web/lib/view-override";
import { ActionButton } from "@web/seed-design/ui/action-button";
import { Callout } from "@web/seed-design/ui/callout";

/**
 * 데스크탑 소개 페이지의 CTA. 앱 화면은 모바일 UI 뿐이라 로그인 대신 휴대폰 이용을 안내하고,
 * 원하면 이 브라우저에서 모바일 화면으로 열 수 있게 한다 (`seedbook.view=mobile` 쿠키).
 */
export function LandingMobileOnly({ host }: { host: string }) {
  return (
    <VStack align="center" gap="x3">
      <Callout
        tone="neutral"
        prefixIcon={<IconMobileLine />}
        description={
          <>
            휴대폰 브라우저에서 <strong className="font-bold">{host}</strong> 에 접속해 시작하세요
          </>
        }
      />
      <ActionButton
        variant="ghost"
        size="small"
        color="fg.neutralMuted"
        onClick={() => {
          setViewOverride("mobile");
          window.location.href = "/assets";
        }}
      >
        이 브라우저에서 모바일 화면으로 열기
      </ActionButton>
    </VStack>
  );
}
