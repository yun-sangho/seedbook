import type { SharedOwner } from "@web/features/sharing/stores/view-context-store";
import type { SharedEnvelope } from "@web/features/sharing/hooks/use-shared-envelopes";

/**
 * envelope.state[stateKey] 가 배열이면 배열을, 아니면 빈 배열을 돌려준다.
 *
 * 도메인 store envelope 의 state 모양이 일관성 없을 수 있어서 (특히 마이그레이션
 * 도중 owner 라면 v3 상태일 수도 있음) 안전하게 빈 배열로 떨어뜨린다.
 */
export function extractStateArray<T>(
  envelope: SharedEnvelope["envelope"],
  stateKey: string,
): T[] {
  if (!envelope?.state) return [];
  const v = (envelope.state as Record<string, unknown>)[stateKey];
  return Array.isArray(v) ? (v as T[]) : [];
}

export type AggregatedGroup<T> = {
  ownerId: string;
  ownerName: string;
  ownerLabel: string | null;
  items: T[];
};

/**
 * active aggregate owner 들의 envelope 에서 같은 stateKey 를 뽑아 그룹 배열로 만든다.
 *
 * envelope 이 아직 안 와도 빈 그룹을 만들지 않는다 — items 가 없으면 호출 측에서
 * 표시 안 함. 캐시 미스로 envelope=null 이면 빈 items 로 그대로 둠.
 */
export function buildSharedGroups<T>(
  owners: SharedOwner[],
  envelopes: Map<string, SharedEnvelope>,
  stateKey: string,
): AggregatedGroup<T>[] {
  return owners.map((owner) => {
    const env = envelopes.get(owner.ownerId)?.envelope ?? null;
    return {
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
      ownerLabel: owner.label,
      items: extractStateArray<T>(env, stateKey),
    };
  });
}

/**
 * 필터 ID 배열을 boolean 판별 함수로 만든다. 빈 배열 = 모두 표시.
 */
export function makeFilterPredicate(
  filter: readonly string[],
): (id: string) => boolean {
  if (filter.length === 0) return () => true;
  const set = new Set(filter);
  return (id) => set.has(id);
}
