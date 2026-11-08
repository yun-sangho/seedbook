/**
 * 엔티티 단위 동기화의 순수 상태 전환. 브라우저/네트워크 의존 없이 테스트한다.
 *
 * 클라이언트는 store 의 목록(`T[]`)을 그대로 두고, 옆에 `SyncMeta` 를 둔다:
 *   - `versions`: 엔티티별로 마지막으로 본 서버 version (mutation 의 baseVersion)
 *   - `outbox`: 아직 서버가 받지 않은 변경. 엔티티당 최신 하나만 남긴다.
 *   - `pendingOrder`: 아직 보내지 않은 목록 순서
 *   - `cursor`: 다음 pull 의 since
 *
 * 충돌 정책: 서버가 이긴다. 충돌한 엔티티는 서버 값으로 덮고 로컬 변경은 버린다.
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
  | { status: "conflict"; current: SyncedEntity | null }
  | { status: "rejected"; reason: string };

/** 보낸 mutation 이 무엇이었는지 — 결과를 outbox 에 되돌려 적용할 때 쓴다. */
export type SentRef =
  | { kind: "entity"; id: string; seq: number; data: EntityData | null }
  | { kind: "order"; seq: number };

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
    const baseVersion = meta.versions[id] ?? 0;
    if (entry.op === "upsert") {
      mutations.push({ entity, op: "upsert", id, baseVersion, data: entry.data });
      sent.push({ kind: "entity", id, seq: entry.seq, data: entry.data });
    } else {
      mutations.push({ entity, op: "delete", id, baseVersion });
      sent.push({ kind: "entity", id, seq: entry.seq, data: null });
    }
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
 * 서버 결과를 반영한다. `remote` 는 충돌로 서버 값이 이긴 엔티티 — 호출자가 store 에 적용.
 * 결과를 기다리는 동안 같은 엔티티가 또 바뀌었다면 (seq 가 다름) outbox 항목은 남긴다.
 */
export function applyMutationResults(
  meta: SyncMeta,
  sent: SentRef[],
  results: MutationResult[]
): { meta: SyncMeta; remote: SyncedEntity[] } {
  const versions = { ...meta.versions };
  const outbox = { ...meta.outbox };
  let pendingOrder = meta.pendingOrder;
  const remote: SyncedEntity[] = [];

  sent.forEach((ref, i) => {
    const result = results[i];
    if (!result) return; // 응답이 모자라면 다음 flush 에 다시 보낸다.

    if (ref.kind === "order") {
      if (pendingOrder?.seq === ref.seq) pendingOrder = null;
      return;
    }

    const unchangedSinceSent = outbox[ref.id]?.seq === ref.seq;
    const clear = () => {
      if (unchangedSinceSent) delete outbox[ref.id];
    };

    if (result.status === "ok") {
      if (result.version !== undefined) versions[ref.id] = result.version;
      clear();
      return;
    }

    if (result.status === "rejected") {
      clear();
      return;
    }

    // conflict
    const current = result.current;
    if (!current) {
      // 서버에 행이 없다 — 이 엔티티는 서버 기준으로 존재하지 않는다.
      delete versions[ref.id];
      delete outbox[ref.id];
      remote.push({ id: ref.id, version: 0, deletedAt: new Date(0).toISOString(), data: null });
      return;
    }
    versions[ref.id] = current.version;
    const echoOfMine =
      (ref.data === null && current.deletedAt !== null) ||
      (ref.data !== null && current.deletedAt === null && sameData(ref.data, current.data));
    if (echoOfMine) {
      clear();
      return;
    }
    delete outbox[ref.id];
    remote.push(current);
  });

  return { meta: { ...meta, versions, outbox, pendingOrder }, remote };
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

/**
 * 충돌로 이긴 서버 값을 목록에 그대로 반영한다 (version 비교 없이 — `applyMutationResults`
 * 가 이미 versions 를 서버 값으로 맞춰 둔다).
 */
export function applyRemoteEntities<T extends { id: string }>(
  items: T[],
  remote: SyncedEntity[],
  fromData: (id: string, data: EntityData) => T
): T[] {
  let next = items.slice();
  for (const entity of remote) {
    if (entity.deletedAt !== null || entity.data === null) {
      next = next.filter((i) => i.id !== entity.id);
      continue;
    }
    const incoming = fromData(entity.id, entity.data);
    const index = next.findIndex((i) => i.id === entity.id);
    if (index === -1) next.push(incoming);
    else next[index] = incoming;
  }
  return next;
}
