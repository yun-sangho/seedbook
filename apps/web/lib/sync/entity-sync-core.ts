/**
 * 엔티티 단위 동기화의 순수 상태 전환. 브라우저/네트워크 의존 없이 테스트한다.
 *
 * 클라이언트는 store 의 목록(`T[]`)을 그대로 두고, 옆에 `SyncMeta` 를 둔다:
 *   - `versions`: 엔티티별로 마지막으로 본 서버 version
 *   - `outbox`: 아직 서버가 받지 않은 변경. 엔티티당 최신 하나만 남긴다.
 *   - `pendingOrder`: 아직 보내지 않은 목록 순서
 *   - `cursor`: 다음 pull 의 since
 *
 * 충돌 정책: 마지막 저장이 이긴다. 자산은 본인만 수정하므로 기기 사이의 변경 충돌은
 * 따지지 않는다. `versions` 는 pull 로 이미 본 변경을 다시 적용하지 않는 데만 쓴다.
 */

export type EntityData = Record<string, unknown>;

export type OutboxEntry =
  | { op: "upsert"; data: EntityData; seq: number }
  | { op: "delete"; seq: number };

export type SyncMeta = {
  cursor: string | null;
  versions: Record<string, number>;
  outbox: Record<string, OutboxEntry>;
  pendingOrder: { order: string[]; seq: number } | null;
  /** outbox 항목마다 붙이는 증가 번호 — 전송 중에 다시 바뀌었는지 가린다. */
  seq: number;
};

export type SyncedEntity = {
  id: string;
  version: number;
  deletedAt: string | null;
  data: EntityData | null;
};

export type MutationResult =
  | { status: "ok"; version?: number }
  | { status: "rejected"; reason: string };

/** 보낸 mutation 이 무엇이었는지 — 결과를 outbox 에 되돌려 적용할 때 쓴다. */
export type SentRef = { kind: "entity"; id: string; seq: number } | { kind: "order"; seq: number };

export function emptySyncMeta(): SyncMeta {
  return { cursor: null, versions: {}, outbox: {}, pendingOrder: null, seq: 0 };
}

const sameData = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * store 목록이 `prev` → `next` 로 바뀐 것을 outbox 에 기록한다.
 */
export function recordLocalChange<T extends { id: string }>(
  meta: SyncMeta,
  prev: T[],
  next: T[],
  toData: (item: T) => EntityData
): SyncMeta {
  let seq = meta.seq;
  const outbox = { ...meta.outbox };
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextIds = new Set(next.map((n) => n.id));

  for (const item of next) {
    const before = prevById.get(item.id);
    const data = toData(item);
    if (before && sameData(toData(before), data)) continue;
    seq += 1;
    outbox[item.id] = { op: "upsert", data, seq };
  }

  for (const item of prev) {
    if (nextIds.has(item.id)) continue;
    if (meta.versions[item.id] === undefined) {
      // 서버가 모르는 (아직 보내지 않은) 엔티티 — 보낼 것도 지울 것도 없다.
      delete outbox[item.id];
      continue;
    }
    seq += 1;
    outbox[item.id] = { op: "delete", seq };
  }

  const prevOrder = prev.map((p) => p.id);
  const nextOrder = next.map((n) => n.id);
  let pendingOrder = meta.pendingOrder;
  if (!sameOrder(prevOrder, nextOrder)) {
    seq += 1;
    pendingOrder = { order: nextOrder, seq };
  }

  return { ...meta, outbox, pendingOrder, seq };
}

/**
 * outbox 를 서버 mutation 목록으로 만든다. 엔티티 → 순서 순.
 */
export function buildMutations(
  meta: SyncMeta,
  entity: string,
  listOrderDomain: string
): { mutations: unknown[]; sent: SentRef[] } {
  const mutations: unknown[] = [];
  const sent: SentRef[] = [];

  for (const [id, entry] of Object.entries(meta.outbox)) {
    mutations.push(
      entry.op === "upsert"
        ? { entity, op: "upsert", id, data: entry.data }
        : { entity, op: "delete", id }
    );
    sent.push({ kind: "entity", id, seq: entry.seq });
  }

  if (meta.pendingOrder) {
    mutations.push({
      entity: "listOrder",
      op: "set",
      domain: listOrderDomain,
      order: meta.pendingOrder.order,
    });
    sent.push({ kind: "order", seq: meta.pendingOrder.seq });
  }

  return { mutations, sent };
}

/**
 * 서버 결과를 반영한다. 결과를 기다리는 동안 같은 엔티티가 또 바뀌었다면 (seq 가 다름)
 * outbox 항목은 남긴다. 거부된 변경이 있으면 로컬 목록이 서버와 어긋났으므로 커서를
 * 지워 다음 pull 이 전체를 다시 받게 한다 (`rejected` 개수로 호출자에게 알린다).
 */
export function applyMutationResults(
  meta: SyncMeta,
  sent: SentRef[],
  results: MutationResult[]
): { meta: SyncMeta; rejected: number } {
  const versions = { ...meta.versions };
  const outbox = { ...meta.outbox };
  let pendingOrder = meta.pendingOrder;
  let rejected = 0;

  sent.forEach((ref, i) => {
    const result = results[i];
    if (!result) return; // 응답이 모자라면 다음 flush 에 다시 보낸다.

    if (ref.kind === "order") {
      if (pendingOrder?.seq === ref.seq) pendingOrder = null;
      return;
    }
    if (result.status === "ok" && result.version !== undefined) {
      versions[ref.id] = result.version;
    }
    if (result.status === "rejected") rejected += 1;
    if (outbox[ref.id]?.seq === ref.seq) delete outbox[ref.id];
  });

  const cursor = rejected > 0 ? null : meta.cursor;
  return { meta: { ...meta, cursor, versions, outbox, pendingOrder }, rejected };
}

/**
 * pull 결과를 store 목록에 합친다. 로컬에 보내지 않은 변경이 있는 엔티티는 건드리지 않는다
 * (그 변경을 보내면 서버가 충돌로 판정해 돌려준다).
 */
export function mergePull<T extends { id: string }>(
  items: T[],
  meta: SyncMeta,
  pull: { cursor: string | null; entities: SyncedEntity[]; order: string[] | null },
  fromData: (id: string, data: EntityData) => T
): { items: T[]; meta: SyncMeta } {
  const versions = { ...meta.versions };
  let next = items.slice();

  for (const entity of pull.entities) {
    if (meta.outbox[entity.id]) continue;
    const known = versions[entity.id];
    if (known !== undefined && entity.version <= known) continue;
    versions[entity.id] = entity.version;

    if (entity.deletedAt !== null || entity.data === null) {
      next = next.filter((i) => i.id !== entity.id);
      continue;
    }
    const incoming = fromData(entity.id, entity.data);
    const index = next.findIndex((i) => i.id === entity.id);
    if (index === -1) next.push(incoming);
    else next[index] = incoming;
  }

  if (pull.order && !meta.pendingOrder) {
    next = applyOrder(next, pull.order);
  }

  return { items: next, meta: { ...meta, versions, cursor: pull.cursor } };
}

/** `order` 순으로 정렬하고, order 에 없는 항목은 기존 순서대로 뒤에 붙인다. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const ranked = items
    .filter((i) => rank.has(i.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const rest = items.filter((i) => !rank.has(i.id));
  return [...ranked, ...rest];
}
