"use client";

import {
  downloadAccountSnapshots,
  fillMissingSnapshots,
  uploadAccountSnapshots,
} from "@web/features/investments/utils/account-value-history-storage";
import { clearEntitySyncState } from "./sync/managed-stores";
import { ensureRecordsImported, getRecordLayer, getSyncEngine } from "./sync/record-sync";
import { finishCloudForLocal, mergeLocalIntoCloud } from "./sync/v2/mode-switch";

/**
 * 저장소 모드 전환 (설계 §5.5). 레코드를 push/pull 로 옮긴다 (`lib/sync/v2/mode-switch.ts`).
 *
 * 원칙:
 *   - **전환으로 데이터를 잃지 않는다.** 덮어쓰지 않고 로컬과 클라우드를 합친다 (같은 항목은 로컬 우선,
 *     포트폴리오 식물은 더 자란 쪽). 다른 기기에서 지운 항목은 되살리지 않는다 (삭제가 이긴다).
 *   - 계좌 총액 일별 기록(local 은 기기, cloud 는 서버가 기록)도 합친다 — 자산을 옮긴 뒤(서버에 계좌가
 *     생긴 뒤) 마지막에 한다.
 *   - 실패하면 에러를 던진다 — 호출자는 모드를 바꾸지 않고 다시 시도하게 한다 (몇 번을 해도 결과가 같다).
 */

export type MigrationStep = "records" | "history";

export type MigrationProgress = { step: MigrationStep };

/** 로컬 → 클라우드: 기기 레코드를 서버와 합친다. */
export async function uploadAllToCloud(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  onProgress?.({ step: "records" });
  await ensureRecordsImported();
  await mergeLocalIntoCloud(getSyncEngine(), getRecordLayer());
  onProgress?.({ step: "history" });
  // 올리기 전에 빠진 날을 채운다. 종가를 못 받아도 전환은 막지 않는다 (있는 기록만 올린다).
  await fillMissingSnapshots().catch(() => 0);
  await uploadAccountSnapshots();
  clearEntitySyncState();
}

/**
 * 클라우드 → 로컬: 보내지 못한 변경을 보내고 최신까지 받는다. 기기 레코드가 그대로 이 기기의 데이터가
 * 된다 (브라우저 localStorage, 네이티브 앱 SQLite). 보내지 못한 변경이 남으면 막는다.
 */
export async function downloadAllFromCloud(
  onProgress?: (p: MigrationProgress) => void
): Promise<void> {
  onProgress?.({ step: "records" });
  await ensureRecordsImported();
  await finishCloudForLocal(getSyncEngine(), getRecordLayer());
  onProgress?.({ step: "history" });
  await downloadAccountSnapshots();
  clearEntitySyncState();
}

/** 서버에 이 계정의 것으로 있는 항목(계좌·포트폴리오·리밸런싱)의 id. 저장소 모드와 상관없다. */
export async function fetchCloudItemIds(): Promise<Set<string>> {
  const records = await getSyncEngine().fetchServerRecords();
  if (!Array.isArray(records)) throw new Error("서버 데이터를 확인하지 못했어요");
  return new Set(records.filter((r) => r.parentId === null).map((r) => r.id));
}

/**
 * 이 기기에 자산 데이터가 있는지 — 없으면 클라우드로 바꿀 때 확인을 건너뛴다.
 */
export async function hasAnyLocalData(): Promise<boolean> {
  await ensureRecordsImported();
  return (await getRecordLayer().loadRecords()).size > 0;
}
