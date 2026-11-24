import type { BackupSections } from "./data-backup";
import { type ReassignedIds, reassignIds } from "./reassign-ids";

/**
 * 백업을 내보낸 계정의 표시. 같은 계정인지 비교하는 데만 쓴다 — 파일에 개인 정보나 사용자 id 를
 * 남기지 않도록 단방향 해시다.
 */
export async function backupAccountTag(userId: string): Promise<string> {
  const input = new TextEncoder().encode(`seedbook-backup-account:${userId}`);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 가져올 백업의 id 를 정한다. 저장소 모드와 상관없이 가져올 때 정한다 — local 모드에서 가져온
 * 데이터도 나중에 클라우드로 옮길 수 있다.
 *
 *   - 같은 계정의 백업: id 를 그대로 쓴다.
 *   - 다른 계정의 백업: 모두 이 계정의 새 id 로 바꾼다.
 *   - 계정 표시가 없는 예전 백업: 서버에 이 계정의 것으로 있는 행만 id 를 유지하고 나머지는 바꾼다.
 *     이 기기의 데이터는 근거로 쓰지 않는다 — 남의 백업을 원래 id 로 가져와 둔 것일 수 있다.
 */
export async function resolveBackupIds(
  backup: { data: Partial<BackupSections>; accountTag: string | null },
  userId: string,
  { fetchOwnIds }: { fetchOwnIds: () => Promise<ReadonlySet<string>> }
): Promise<ReassignedIds> {
  const { data, accountTag } = backup;
  if (accountTag === null) return reassignIds(data, userId, await fetchOwnIds());
  if (accountTag === (await backupAccountTag(userId))) return { data, newIds: new Map() };
  return reassignIds(data, userId);
}
