import Image from "next/image";
import { HStack, Text } from "@seed-design/react";

/** Seedbook 로고 (나뭇가지 + 이름). 그림은 favicon·PWA 아이콘과 같고, PWA 아이콘 파일을 쓴다. */
export function SiteBrand() {
  return (
    <HStack gap="x2" align="center">
      <Image
        src="/android-chrome-192x192.png"
        alt=""
        width={24}
        height={24}
        className="size-x6"
        unoptimized
      />
      <Text textStyle="t5Bold">Seedbook</Text>
    </HStack>
  );
}
