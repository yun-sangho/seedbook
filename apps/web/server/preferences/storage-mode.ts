import type { StorageMode } from "@mobile/lib/storage-mode";
import { type Database, schema } from "@seedbook/database";
import { isNull, sql } from "drizzle-orm";

/**
 * 이 시각부터 가입한 사용자는 처음에 저장 방식을 고른다. 그 전 사용자는 고르지 않아도 기본값 local
 * 을 쓰고 있었으므로 "지금 방식" 이 있다.
 */
export const STORAGE_CHOICE_SINCE = new Date("2026-11-25T00:00:00.000Z");

export interface StorageModeStatus {
  storageMode: StorageMode;
  /** 직접 고른 적이 있는지. 아니면 선택 화면을 보여 준다. */
  chosen: boolean;
  /** 이미 이 방식으로 쓰고 있는지. 아니면 (새 사용자) `storageMode` 는 기본값일 뿐이다. */
  inUse: boolean;
}

export async function readStorageMode(db: Database, userId: string): Promise<StorageModeStatus> {
  const preference = await db.query.userPreference.findFirst({
    where: (t, { eq }) => eq(t.userId, userId),
    columns: { storageMode: true, storageModeChosenAt: true },
  });
  const storageMode = preference?.storageMode === "cloud" ? "cloud" : "local";
  if (preference?.storageModeChosenAt) return { storageMode, chosen: true, inUse: true };

  const inUse = preference !== undefined || (await usedBeforeChoice(db, userId));
  return { storageMode, chosen: false, inUse };
}

async function usedBeforeChoice(db: Database, userId: string): Promise<boolean> {
  const owner = await db.query.user.findFirst({
    where: (t, { eq }) => eq(t.id, userId),
    columns: { createdAt: true },
    with: {
      investmentAccounts: { columns: { id: true }, limit: 1 },
      portfolios: { columns: { id: true }, limit: 1 },
    },
  });
  if (!owner) return false;
  return (
    owner.createdAt < STORAGE_CHOICE_SINCE ||
    owner.investmentAccounts.length > 0 ||
    owner.portfolios.length > 0
  );
}

/**
 * 사용자가 고른 모드를 저장한다 — 같은 행의 다른 설정은 그대로. `onlyIfUnchosen` 인데 이미
 * 골랐으면 아무것도 바꾸지 않고 false.
 */
export async function chooseStorageMode(
  db: Database,
  userId: string,
  mode: StorageMode,
  now: Date,
  { onlyIfUnchosen = false }: { onlyIfUnchosen?: boolean } = {}
): Promise<boolean> {
  const { userPreference } = schema;
  const rows = await db
    .insert(userPreference)
    .values({ userId, storageMode: mode, storageModeChosenAt: now })
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: {
        storageMode: mode,
        // 처음 고른 시각을 남긴다.
        storageModeChosenAt: sql`coalesce(${userPreference.storageModeChosenAt}, excluded."storageModeChosenAt")`,
      },
      setWhere: onlyIfUnchosen ? isNull(userPreference.storageModeChosenAt) : undefined,
    })
    .returning({ userId: userPreference.userId });
  return rows.length > 0;
}
