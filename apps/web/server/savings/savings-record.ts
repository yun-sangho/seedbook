import type { schema } from "@seedbook/database";
import {
  bigIntToNumber,
  formatDate,
  parseDate,
  toBigInt,
} from "@web/app/api/storage/_translators/types";

/**
 * 저축 계좌 한 건의 동기화 표현 (`features/savings` 의 `SavingsItem` 과 같은 모양, id 제외).
 * 잔액 기록(`records`)은 계좌에 딸린 하위 데이터라 계좌와 함께 주고받는다.
 */
export type SavingsFields = {
  accountName: string;
  accountType: string;
  currency: string;
  balance: number;
  interestRate: number | null;
  note: string;
  color: string;
  records: Array<{ date: string; balance: number }>;
};

type SavingsRow = typeof schema.savingsAccount.$inferSelect;
type SavingsRecordRow = typeof schema.savingsRecord.$inferSelect;

const isText = (x: unknown): x is string => typeof x === "string";
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** 외부 입력 검증. 잘못된 모양이면 `null`. */
export function parseSavingsFields(value: unknown): SavingsFields | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const interestRate = v.interestRate ?? null;
  const note = v.note ?? "";
  const rawRecords = v.records ?? [];
  if (
    !isText(v.accountName) ||
    !isText(v.accountType) ||
    !isText(v.currency) ||
    !isNumber(v.balance) ||
    !(interestRate === null || isNumber(interestRate)) ||
    !isText(note) ||
    !isText(v.color) ||
    !Array.isArray(rawRecords)
  ) {
    return null;
  }

  const records: SavingsFields["records"] = [];
  for (const r of rawRecords) {
    if (!r || typeof r !== "object") return null;
    const { date, balance } = r as Record<string, unknown>;
    if (!isText(date) || parseDate(date) === null || !isNumber(balance)) return null;
    records.push({ date, balance });
  }

  return {
    accountName: v.accountName,
    accountType: v.accountType,
    currency: v.currency,
    balance: v.balance,
    interestRate,
    note,
    color: v.color,
    records,
  };
}

/** 계좌 행 컬럼 (id / userId / 동기화 컬럼 제외). */
export function savingsFieldsToColumns(fields: SavingsFields) {
  return {
    accountName: fields.accountName,
    accountType: fields.accountType,
    currency: fields.currency,
    balance: toBigInt(fields.balance),
    interestRate: fields.interestRate,
    note: fields.note,
    color: fields.color,
  };
}

/** 잔액 기록 행. 날짜가 깨진 기록은 버린다. */
export function savingsRecordsToRows(accountId: string, fields: Pick<SavingsFields, "records">) {
  return fields.records
    .map((r) => {
      const date = parseDate(r.date);
      return date ? { accountId, date, balance: toBigInt(r.balance) } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/** DB 행 + 기록 → 동기화 표현. 기록은 최신 날짜가 먼저. */
export function savingsRowToFields(row: SavingsRow, records: SavingsRecordRow[]): SavingsFields {
  return {
    accountName: row.accountName,
    accountType: row.accountType,
    currency: row.currency,
    balance: bigIntToNumber(row.balance),
    interestRate: row.interestRate,
    note: row.note,
    color: row.color,
    records: records
      .slice()
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((r) => ({ date: formatDate(r.date), balance: bigIntToNumber(r.balance) })),
  };
}
