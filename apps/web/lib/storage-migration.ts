"use client";

import { CLOUD_STORE_KEYS, type CloudStoreKey } from "@web/lib/storage-mode";
import { mergeEnvelopes, type PersistEnvelope } from "./storage-merge";
import { clearEntitySyncState } from "./sync/managed-stores";

/**
 * 저장소 모드 전환 시 사용하는 일괄 업로드 / 다운로드 헬퍼.
 *
 * 원칙:
 *   - **전환으로 데이터를 잃지 않는다.** 덮어쓰지 않고 로컬과 클라우드를 합친다
 *     (`mergeEnvelopes`: 합집합, 같은 항목은 로컬 우선).
 *   - 모든 key 를 **순차적**으로 처리 (병렬 실패 복구가 복잡해지므로).
 *   - 각 단계 진행 상황을 `onProgress` 콜백으로 노출.
 *   - 실패 시 에러를 throw — 호출자는 모드를 바꾸지 않고 재시도하게 한다
 *     (합치기는 몇 번을 다시 해도 결과가 같다).
 */

export type MigrationProgress = {
  index: number; // 0-based
  total: number;
  key: CloudStoreKey;
  phase: "uploading" | "downloading" | "skipped" | "done";
};

/**
 * 로컬 → 클라우드: 로컬 envelope 를 클라우드 envelope 와 합쳐 `PUT` 한다.
 * 로컬에 없는 key 는 건드리지 않는다 (클라우드 데이터가 그대로 남음).
 */
export async function uploadAllToCloud(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  for (let i = 0; i < CLOUD_STORE_KEYS.length; i += 1) {
    const key = CLOUD_STORE_KEYS[i]!;
    const local = parseEnvelope(readLocalEnvelope(key));
    if (local === null) {
      onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "skipped" });
      continue;
    }
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "uploading" });

    const cloud = await fetchCloudEnvelope(key, "업로드");
    const merged = mergeEnvelopes(key, local, cloud);

    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: merged }),
    });
    if (!res.ok) {
      throw new Error(`업로드 실패 (${key}): ${res.status}`);
    }
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "done" });
  }
  clearEntitySyncState();
}

/**
 * 클라우드 → 로컬: 클라우드 envelope 를 로컬 envelope 와 합쳐 localStorage 에 쓴다.
 * 로컬 캐시에만 있는 항목 (아직 서버로 못 보낸 변경 포함) 도 남는다.
 */
export async function downloadAllFromCloud(
  onProgress?: (p: MigrationProgress) => void
): Promise<void> {
  for (let i = 0; i < CLOUD_STORE_KEYS.length; i += 1) {
    const key = CLOUD_STORE_KEYS[i]!;
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "downloading" });

    const cloud = await fetchCloudEnvelope(key, "다운로드");
    const merged = mergeEnvelopes(key, parseEnvelope(readLocalEnvelope(key)), cloud);
    if (merged !== null) writeLocalEnvelope(key, JSON.stringify(merged));
    onProgress?.({ index: i, total: CLOUD_STORE_KEYS.length, key, phase: "done" });
  }
  clearEntitySyncState();
}

async function fetchCloudEnvelope(
  key: CloudStoreKey,
  action: "업로드" | "다운로드"
): Promise<PersistEnvelope | null> {
  const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`${action} 실패 (${key}): ${res.status}`);
  }
  const body = (await res.json()) as { data?: unknown };
  return isEnvelope(body.data) ? body.data : null;
}

function parseEnvelope(raw: string | null): PersistEnvelope | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEnvelope(parsed) ? parsed : null;
  } catch {
    // 손상된 blob — 없는 것으로 본다.
    return null;
  }
}

function isEnvelope(value: unknown): value is PersistEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as PersistEnvelope).state === "object" &&
    (value as PersistEnvelope).state !== null &&
    typeof (value as PersistEnvelope).version === "number"
  );
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

function writeLocalEnvelope(key: CloudStoreKey, value: string): void {
  try {
    window.localStorage.setItem(key, value);
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
  "portfolio-storage": "포트폴리오",
  "rebalancing-storage": "리밸런싱",
};
