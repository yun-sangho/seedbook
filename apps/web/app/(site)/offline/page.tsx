import type { Metadata } from "next";
import { Icon, Text, VStack } from "@seed-design/react";
import { WifiOff } from "lucide-react";
import { RetryWhenOnline } from "./retry-when-online";

export const metadata: Metadata = {
  title: "오프라인 - Seedbook",
  robots: { index: false },
};

/**
 * 서비스 워커(app/sw.ts) 가 precache 해 두었다가 네비게이션이 네트워크 실패로
 * 끝나면 대신 보여주는 페이지. 인증·데이터가 필요 없는 정적 페이지여야 한다.
 */
export default function OfflinePage() {
  return (
    <main className="flex h-full w-full items-center justify-center p-x6">
      <VStack align="center" gap="x8">
        <VStack align="center" gap="x4" className="text-center break-keep">
          <Icon svg={<WifiOff aria-hidden />} size="x10" color="fg.neutralSubtle" />
          <VStack gap="x2">
            <Text as="h1" textStyle="t8Bold">
              인터넷에 연결되어 있지 않아요
            </Text>
            <Text as="p" textStyle="t5Regular" color="fg.neutralMuted">
              Seedbook 은 온라인 환경에서만 동작해요.
              <br />
              네트워크 연결을 확인한 뒤 다시 시도해 주세요.
            </Text>
          </VStack>
        </VStack>
        <RetryWhenOnline />
      </VStack>
    </main>
  );
}
