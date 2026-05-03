import { db, schema } from "@seedbook/database";
import { and, eq, isNull } from "drizzle-orm";

/**
 * 데이터 공유 권한 검사.
 *
 * 공유 코드를 수락한 수신자는 소유자의 전체 자산 데이터를 읽기 전용으로
 * 열람할 수 있다. 공유가 revoke 되었거나 acceptance 가 삭제되면 즉시 접근이
 * 차단된다.
 */

/**
 * viewer 가 owner 의 데이터를 열람할 수 있는지 확인한다.
 *
 * 본인 데이터를 보려는 경우 (viewer === owner) 도 `true` 를 반환해 호출측의
 * 분기 로직을 단순화한다. 호출측에서 일반 경로와 shared 경로를 구분한다.
 */
export async function canViewData(viewerUserId: string, ownerUserId: string): Promise<boolean> {
  if (viewerUserId === ownerUserId) return true;

  const rows = await db
    .select({ id: schema.dataShareAcceptance.id })
    .from(schema.dataShareAcceptance)
    .innerJoin(schema.dataShare, eq(schema.dataShareAcceptance.shareId, schema.dataShare.id))
    .where(
      and(
        eq(schema.dataShareAcceptance.recipientUserId, viewerUserId),
        eq(schema.dataShare.ownerUserId, ownerUserId),
        isNull(schema.dataShare.revokedAt),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export { generateShareCode } from "./generate-code";
