import type { BackupSections } from "./data-backup";

const ID_NAMESPACE = "seedbook-demo-data";

/**
 * 데모 데이터 파일의 고정 id 를 사용자별 id 로 바꾼다. 고정 id 를 그대로 쓰면 같은 DB 의 다른
 * 사용자가 이미 올린 행과 겹쳐 클라우드 저장이 거부된다.
 *
 * 무작위가 아니라 사용자와 원래 id 로 정한다 — 같은 사용자가 다시 불러오면 같은 id 가 나와,
 * 이미 클라우드에 있는 데모 데이터와 합쳐도 (`mergeEnvelopes`) 중복되지 않는다.
 */
export async function assignDemoDataIds(
  data: Partial<BackupSections>,
  userId: string
): Promise<Partial<BackupSections>> {
  const { investments, portfolios, rebalancingSessions } = data;
  const oldIds = new Set([
    ...(investments ?? []).flatMap((i) => [
      i.id,
      ...i.holdings.map((h) => h.id),
      ...i.cashItems.map((c) => c.id),
    ]),
    ...(portfolios ?? []).flatMap((p) => [
      p.id,
      ...p.accountIds,
      ...p.allocations.map((a) => a.id),
    ]),
    ...(rebalancingSessions ?? []).flatMap((s) => [
      s.id,
      s.accountId,
      s.portfolioId,
      ...s.tasks.map((t) => t.id),
    ]),
  ]);
  const newIds = new Map(
    await Promise.all(
      [...oldIds].map(async (id) => [id, await deriveUuid(`${userId}:${id}`)] as const)
    )
  );
  const idOf = (id: string) => newIds.get(id)!;
  const withNewId = <T extends { id: string }>(item: T): T => ({ ...item, id: idOf(item.id) });

  const result: Partial<BackupSections> = {};
  if (investments) {
    result.investments = investments.map((i) => ({
      ...withNewId(i),
      holdings: i.holdings.map(withNewId),
      cashItems: i.cashItems.map(withNewId),
    }));
  }
  if (portfolios) {
    result.portfolios = portfolios.map((p) => ({
      ...withNewId(p),
      accountIds: p.accountIds.map(idOf),
      allocations: p.allocations.map(withNewId),
    }));
  }
  if (rebalancingSessions) {
    result.rebalancingSessions = rebalancingSessions.map((s) => ({
      ...withNewId(s),
      accountId: idOf(s.accountId),
      portfolioId: idOf(s.portfolioId),
      // 할 일 id 는 포트폴리오 비중(allocation) id 다.
      tasks: s.tasks.map(withNewId),
    }));
  }
  return result;
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
