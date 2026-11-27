import Image from "next/image";
import { HStack, Text } from "@seed-design/react";

/** Seedbook 로고 (씨앗에서 싹 + 이름). 그림은 favicon·앱 아이콘과 같은 마크(brand/mark.svg)다. */
export function SiteBrand() {
  return (
    <HStack gap="x2" align="center">
      <Image src="/logo.svg" alt="" width={24} height={24} className="size-x6" unoptimized />
      <Text textStyle="t5Bold">Seedbook</Text>
    </HStack>
  );
}
