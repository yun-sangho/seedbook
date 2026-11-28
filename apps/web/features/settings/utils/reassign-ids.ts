import type { BackupSections } from "./data-backup";

// 바꾸면 같은 백업을 다시 가져올 때 전과 다른 id 가 나와 중복된다.
const ID_NAMESPACE = "seedbook-demo-data";

const NO_IDS: ReadonlySet<string> = new Set();

export type ReassignedIds = {
  data: Partial<BackupSections>;
  /** 바뀐 id (원래 → 새 id). */
  newIds: ReadonlyMap<string, string>;
};

/**
 * 파일에 담긴 행의 id 를 사용자별 id 로 바꾸고, 그 행을 가리키는 참조도 함께 바꾼다. 다른 사용자가
 * 이미 올린 id 를 그대로 쓰면 클라우드 저장이 거부된다. 파일에 없는 행을 가리키는 참조는 그대로 둔다.
 *
 * 무작위가 아니라 사용자와 원래 id 로 정한다 — 같은 사용자가 다시 불러오면 같은 id 가 나와,
 * 이미 클라우드에 있는 데이터와 합쳐도 (`mergeEnvelopes`) 중복되지 않는다.
 *
 * `keepIds` 의 계좌·포트폴리오·리밸런싱은 하위 행(보유 종목·예수금·비중)까지 id 를 유지한다.
 */
export async function reassignIds(
  source: Partial<BackupSections>,
  userId: string,
  keepIds: ReadonlySet<string> = NO_IDS
): Promise<ReassignedIds> {
  const { investments, portfolios, rebalancingSessions } = source;
  const changes = (row: { id: string }) => !keepIds.has(row.id);
  // 예전 백업에는 하위 목록이 없을 수 있다.
  const oldIds = new Set(
    [
      ...(investments ?? [])
        .filter(changes)
        .flatMap((i) => [i, ...(i.holdings ?? []), ...(i.cashItems ?? [])]),
      ...(portfolios ?? []).filter(changes).flatMap((p) => [p, ...(p.allocations ?? [])]),
      ...(rebalancingSessions ?? []).filter(changes),
    ].map((row) => row.id)
  );
  // 할 일 id 는 포트폴리오 비중(allocation) id 다. 시작한 뒤 포트폴리오에서 빠진 종목의 비중은
  // 파일의 포트폴리오에 없으므로 여기에 없고, 그대로 둔다 (서버의 기본 키가 아니다).
  const newIds = new Map(
    await Promise.all(
      [...oldIds].map(async (id) => [id, await deriveUuid(`${userId}:${id}`)] as const)
    )
  );
  const idOf = (id: string) => newIds.get(id) ?? id;
  const withNewId = <T extends { id: string }>(item: T): T => ({ ...item, id: idOf(item.id) });

  const data: Partial<BackupSections> = {};
  if (investments) {
    data.investments = investments.map((i) => ({
      ...withNewId(i),
      ...(i.holdings && { holdings: i.holdings.map(withNewId) }),
      ...(i.cashItems && { cashItems: i.cashItems.map(withNewId) }),
    }));
  }
  if (portfolios) {
    data.portfolios = portfolios.map((p) => ({
      ...withNewId(p),
      ...(p.accountIds && { accountIds: p.accountIds.map(idOf) }),
      ...(p.allocations && { allocations: p.allocations.map(withNewId) }),
    }));
  }
  if (rebalancingSessions) {
    data.rebalancingSessions = rebalancingSessions.map((s) => ({
      ...withNewId(s),
      accountId: idOf(s.accountId),
      portfolioId: idOf(s.portfolioId),
      ...(s.tasks && { tasks: s.tasks.map(withNewId) }),
    }));
  }
  return { data, newIds };
}

/** SHA-256 으로 만든 UUID (RFC 9562 version 8). */
async function deriveUuid(name: string): Promise<string> {
  const input = new TextEncoder().encode(`${ID_NAMESPACE}:${name}`);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}
