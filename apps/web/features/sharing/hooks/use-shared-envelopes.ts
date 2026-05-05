"use client";

import { useEffect, useRef, useState } from "react";
import {
  useViewContextStore,
  type SharedOwner,
} from "@web/features/sharing/stores/view-context-store";
import type { CloudStoreKey } from "@web/lib/storage-mode";

/**
 * aggregate 모드에서 활성화된 owner 들의 envelope 을 사이드채널로 가져온다.
 *
 * 각 owner 에 대해 `/api/sharing/view/[ownerId]/storage/[key]` 를 호출해
 * `{ state, version }` envelope 을 받아온다. 결과는
 * `{ ownerId → { owner, envelope } }` 맵으로 노출.
 *
 * full-switch 모드거나 aggregate owner 가 없으면 빈 결과를 반환하고 fetch 도
 * 스킵한다 — full-switch 일 때는 hybrid-storage 가 이미 GET 라우팅을 owner 쪽으로
 * 돌리고 있어 로컬 store 가 owner 의 데이터를 그대로 들고 있다.
 *
 * 캐시:
 *   - owner+key 조합으로 모듈 레벨 Map 에 저장. 같은 페이지를 다시 들어와도
 *     이미 받은 envelope 은 재사용.
 *   - aggregate-owners 목록이 바뀌면 새 owner 만 fetch.
 *   - 페이지 reload 로 모듈이 다시 로드되면 캐시는 비움.
 */

type EnvelopeShape = { state: Record<string, unknown>; version: number } | null;

type Cached = {
  envelope: EnvelopeShape;
  fetchedAt: number;
};

const cache = new Map<string, Cached>();

function cacheKey(ownerId: string, key: CloudStoreKey): string {
  return `${ownerId}::${key}`;
}

async function fetchOwnerEnvelope(
  ownerId: string,
  key: CloudStoreKey,
): Promise<EnvelopeShape> {
  const res = await fetch(
    `/api/sharing/view/${encodeURIComponent(ownerId)}/storage/${encodeURIComponent(key)}`,
    { credentials: "include" },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { data: EnvelopeShape };
  return body.data ?? null;
}

export type SharedEnvelope = {
  owner: SharedOwner;
  envelope: EnvelopeShape;
};

export type UseSharedEnvelopesResult = {
  /** owner.ownerId → SharedEnvelope. full-switch 모드면 항상 빈 맵. */
  envelopes: Map<string, SharedEnvelope>;
  /** 한 owner 라도 fetch 진행 중이면 true. */
  loading: boolean;
};

/**
 * `key` 도메인에 대해 active aggregate owner 들의 envelope 을 가져온다.
 *
 * full-switch 모드거나 aggregate 모드에서 active owner 가 없으면 빈 맵 반환.
 */
export function useSharedEnvelopes(key: CloudStoreKey): UseSharedEnvelopesResult {
  const mode = useViewContextStore((s) => s.mode);
  const aggregateOwners = useViewContextStore((s) => s.aggregateOwners);

  const [envelopes, setEnvelopes] = useState<Map<string, SharedEnvelope>>(() => new Map());
  const [loading, setLoading] = useState(false);

  // 매 렌더마다 동일한 객체 참조를 비교하지 않도록 ownerId 배열을 안정화.
  const ownerIdsKey = aggregateOwners.map((o) => o.ownerId).join("|");
  const ownersRef = useRef(aggregateOwners);
  ownersRef.current = aggregateOwners;

  useEffect(() => {
    if (mode !== "aggregate" || aggregateOwners.length === 0) {
      setEnvelopes(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // 캐시 hit 은 즉시 반영, miss 만 fetch.
    const next = new Map<string, SharedEnvelope>();
    const toFetch: SharedOwner[] = [];
    for (const owner of aggregateOwners) {
      const cached = cache.get(cacheKey(owner.ownerId, key));
      if (cached) {
        next.set(owner.ownerId, { owner, envelope: cached.envelope });
      } else {
        toFetch.push(owner);
      }
    }
    setEnvelopes(next);

    if (toFetch.length === 0) {
      setLoading(false);
      return;
    }

    void Promise.all(
      toFetch.map(async (owner) => {
        try {
          const envelope = await fetchOwnerEnvelope(owner.ownerId, key);
          cache.set(cacheKey(owner.ownerId, key), { envelope, fetchedAt: Date.now() });
          if (cancelled) return;
          setEnvelopes((prev) => {
            const updated = new Map(prev);
            updated.set(owner.ownerId, { owner, envelope });
            return updated;
          });
        } catch {
          // 실패한 owner 는 envelope=null 로 둔다 — 화면에는 출처만 표시되고 항목은 없음.
          cache.set(cacheKey(owner.ownerId, key), { envelope: null, fetchedAt: Date.now() });
          if (cancelled) return;
          setEnvelopes((prev) => {
            const updated = new Map(prev);
            updated.set(owner.ownerId, { owner, envelope: null });
            return updated;
          });
        }
      }),
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, key, ownerIdsKey, aggregateOwners]);

  return { envelopes, loading };
}

/**
 * 테스트 전용: 모듈 레벨 캐시를 비운다.
 */
export function __resetSharedEnvelopeCacheForTests(): void {
  cache.clear();
}
