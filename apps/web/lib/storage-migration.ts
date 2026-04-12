"use client";

import { CLOUD_STORE_KEYS, type CloudStoreKey } from "@web/lib/storage-mode";

/**
 * 저장소 모드 전환 시 사용하는 일괄 업로드 / 다운로드 헬퍼.
 *
 * 원칙:
 *   - 6 개 key 를 **순차적**으로 처리 (병렬 실패 복구가 복잡해지므로).
 *   - 각 단계 진행 상황을 `onProgress` 콜백으로 노출.
 *   - 실패 시 에러를 throw — 호출자는 이미 업로드된 key 는 그대로 두고
 *     사용자가 재시도할 수 있게 한다 (idempotent upsert 라 재시도 안전).
 */

export type MigrationProgress = {
  index: number; // 0-based
  total: number;
  key: CloudStoreKey;
  phase: "uploading" | "downloading" | "skipped" | "done";
};

/**
 * 로컬 → 클라우드: 현재 localStorage 에 있는 6 개 envelope 를 순서대로
 * `PUT /api/storage/[key]` 한다. 빈 key 는 스킵 (빈 store 로 cloud 를
 * 덮어쓰지 않도록).
 */
export async function uploadAllToCloud(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  for (let i = 0; i < CLOUD_STORE_KEYS.length; i += 1) {
    const key = CLOUD_STORE_KEYS[i]!;
    const raw = readLocalEnvelope(key);
    if (raw === null) {
      onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "skipped" });
      continue;
    }
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "uploading" });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 손상된 blob — 조용히 스킵한다. 어차피 서버가 거부할 거라 위로 에러를
      // 전파해도 무방하지만, 전환 자체는 계속 진행시키는 편이 안전.
      onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "skipped" });
      continue;
    }

    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: parsed }),
    });
    if (!res.ok) {
      throw new Error(`업로드 실패 (${key}): ${res.status}`);
    }
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "done" });
  }
}

/**
 * 클라우드 → 로컬: 6 개 envelope 를 GET 해서 localStorage 에 그대로 기록한다.
 * 클라우드에 데이터가 없는 key 는 로컬도 클리어 (일관성 유지).
 */
export async function downloadAllFromCloud(
  onProgress?: (p: MigrationProgress) => void
): Promise<void> {
  for (let i = 0; i < CLOUD_STORE_KEYS.length; i += 1) {
    const key = CLOUD_STORE_KEYS[i]!;
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "downloading" });

    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`다운로드 실패 (${key}): ${res.status}`);
    }
    const body = (await res.json()) as { data: unknown };
    if (body.data === null || body.data === undefined) {
      writeLocalEnvelope(key, null);
    } else {
      writeLocalEnvelope(key, JSON.stringify(body.data));
    }
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "done" });
  }
}

/**
 * 로컬에 아무 envelope 도 없는지 — 업로드를 아예 건너뛰어야 할지 판단할 때 사용.
 * (빈 스토어로 기존 클라우드 데이터를 덮어쓰는 사고를 방지.)
 */
export function hasAnyLocalData(): boolean {
  return CLOUD_STORE_KEYS.some((key) => readLocalEnvelope(key) !== null);
}

function readLocalEnvelope(key: CloudStoreKey): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalEnvelope(key: CloudStoreKey, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // 쓰기 실패는 무시 — 전환 자체는 계속 진행.
  }
}

/**
 * 사람이 읽을 수 있는 store 이름. 진행 모달에서 "투자 데이터 업로드 중..." 같은
 * 메시지에 사용.
 */
export const CLOUD_STORE_LABELS: Record<CloudStoreKey, string> = {
  "investment-storage": "투자",
  "savings-storage": "저축",
  "asset-plan-storage": "자산 계획",
  "real-assets-storage": "실물 자산",
  "debts-storage": "대출",
  "progress-storage": "자산 기록",
};
