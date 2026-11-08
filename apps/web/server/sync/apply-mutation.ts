import type { Database } from "@seedbook/database";
import { parseDebtFields } from "@web/server/debts/debt-record";
import { deleteDebt, upsertDebt } from "@web/server/debts/debt-sync";
import { isListOrderDomain, setListOrder } from "./list-order";
import type { MutationResult } from "./types";

const INVALID: MutationResult = { status: "rejected", reason: "invalid" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * 클라이언트가 보낸 mutation 하나를 검증하고 적용한다. 입력은 신뢰하지 않으므로
 * 모양이 틀리면 `rejected: invalid` 로 돌려줄 뿐 throw 하지 않는다.
 *
 * mutation 모양:
 *   { entity: "debt", op: "upsert", id, baseVersion, data }
 *   { entity: "debt", op: "delete", id, baseVersion }
 *   { entity: "listOrder", op: "set", domain, order: string[] }
 */
export async function applyMutation(
  db: Database,
  userId: string,
  mutation: unknown
): Promise<MutationResult> {
  if (!mutation || typeof mutation !== "object") return INVALID;
  const m = mutation as Record<string, unknown>;

  if (m.entity === "debt") {
    if (typeof m.id !== "string" || !UUID_RE.test(m.id) || !isVersion(m.baseVersion)) {
      return INVALID;
    }
    if (m.op === "upsert") {
      const fields = parseDebtFields(m.data);
      if (!fields) return INVALID;
      return upsertDebt(db, userId, m.id, m.baseVersion, fields);
    }
    if (m.op === "delete") {
      return deleteDebt(db, userId, m.id, m.baseVersion);
    }
    return INVALID;
  }

  if (m.entity === "listOrder" && m.op === "set") {
    const order = m.order;
    if (
      !isListOrderDomain(m.domain) ||
      !Array.isArray(order) ||
      !order.every((id) => typeof id === "string")
    ) {
      return INVALID;
    }
    return setListOrder(db, userId, m.domain, order as string[]);
  }

  return INVALID;
}
