import { SeedAvatar } from "@mobile/components/seed-avatar";
import { PlantAvatar } from "@mobile/features/garden/components/plant-avatar";
import { PLANT_STAGES } from "@mobile/features/garden/plant-3d/plant-options";
import type { ProfileAvatar } from "@mobile/features/portfolio/utils/plant-avatar";
import { UserRound } from "lucide-react";

/**
 * 프로필 아바타 (`resolveProfileAvatar` 결과): 고른 식물 또는 가장 크게 자란 식물의 2D 모습,
 * 포트폴리오가 없으면 씨앗 아바타, 가입 단계 전이면 기본 아이콘.
 */
export function ProfileAvatarImage({ avatar, size }: { avatar: ProfileAvatar; size: number }) {
  if (avatar.kind === "plant") {
    return (
      <span className="inline-flex shrink-0">
        <PlantAvatar
          stage={PLANT_STAGES[avatar.stage]}
          kind={avatar.plantKind}
          ripe={avatar.ripe}
          empty={avatar.empty}
          size={size}
        />
      </span>
    );
  }
  if (avatar.variant) {
    return <SeedAvatar variant={avatar.variant} size={size} className="shrink-0" />;
  }
  return (
    <span
      className="bg-bg-neutral-weak text-fg-neutral-muted flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <UserRound size={Math.round(size * 0.6)} strokeWidth={1.75} />
    </span>
  );
}
