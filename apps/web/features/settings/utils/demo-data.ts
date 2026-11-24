import type { BackupSections } from "./data-backup";
import { reassignIds } from "./reassign-ids";

/** 데모 데이터 파일의 고정 id 를 사용자별 id 로 바꾼다. */
export async function assignDemoDataIds(
  data: Partial<BackupSections>,
  userId: string
): Promise<Partial<BackupSections>> {
  return (await reassignIds(data, userId)).data;
}
