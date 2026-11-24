import { HStack, Icon, Text } from "@seed-design/react";
import { Sprout } from "lucide-react";

/** Seedbook 로고 (새싹 + 이름). */
export function SiteBrand() {
  return (
    <HStack gap="x2" align="center">
      <Icon svg={<Sprout aria-hidden />} size="x5" color="fg.informative" />
      <Text textStyle="t5Bold">Seedbook</Text>
    </HStack>
  );
}
