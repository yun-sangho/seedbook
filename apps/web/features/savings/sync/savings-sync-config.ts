import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import type { SavingsItem } from "../types/types";

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * 저축 store (`savings-storage`) 의 엔티티 동기화 설정. store 를 import 하지 않는다 —
 * hybrid-storage 가 store 보다 먼저 이 설정을 읽는다.
 */
export const savingsSyncConfig: ManagedStoreConfig<SavingsItem> = {
  storageKey: "savings-storage",
  entity: "savings",
  listOrderDomain: "savings-accounts",
  metaKey: "seedbook.sync.savings",
  persistVersion: 3,
  itemsField: "savings",
  // 서버 검증(parseSavingsFields)은 유한한 숫자만 받는다 — 입력 도중의 NaN 은 0 으로 보낸다.
  toData: (item) => ({
    accountName: text(item.accountName),
    accountType: text(item.accountType),
    currency: text(item.currency),
    balance: num(item.balance),
    interestRate:
      typeof item.interestRate === "number" && Number.isFinite(item.interestRate)
        ? item.interestRate
        : null,
    note: text(item.note),
    color: text(item.color),
    records: (item.records ?? []).map((r) => ({ date: text(r.date), balance: num(r.balance) })),
  }),
  fromData: (id, data) => {
    const records = Array.isArray(data.records)
      ? (data.records as Array<Record<string, unknown>>).map((r) => ({
          date: text(r.date),
          balance: num(r.balance),
        }))
      : [];
    const item: SavingsItem = {
      id,
      accountName: text(data.accountName),
      accountType: text(data.accountType),
      currency: text(data.currency),
      balance: num(data.balance),
      records,
      note: text(data.note),
      color: text(data.color),
    };
    if (typeof data.interestRate === "number") item.interestRate = data.interestRate;
    return item;
  },
};
