const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 실제로 있는 날짜의 YYYY-MM-DD 인지. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

/**
 * 계좌 총액 일별 기록(`investment_account_snapshot`) 한 행의 주고받는 모양 (금액은 원). 기기 기록
 * (local 모드, `features/investments/utils/account-value-history.ts`)·기기 SQLite·모드 전환 API
 * (`/api/account-snapshots`)가 같은 모양과 검증을 쓴다. 클라이언트도 쓰므로 DB 를 import 하지 않는다.
 */
export interface AccountSnapshotPayload {
  accountId: string;
  date: string;
  stockValue: number;
  cashValue: number;
  totalValue: number;
  holdingCount: number;
  missingPriceCount: number;
  oldestPriceDate: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isAmount = (v: unknown): v is number => Number.isSafeInteger(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** 모양이 맞는 기록만 남긴다. 배열이 아니면 null. */
export function parseSnapshotPayloads(value: unknown): AccountSnapshotPayload[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item): AccountSnapshotPayload[] => {
    const s = item as Partial<AccountSnapshotPayload> | null;
    if (
      typeof s !== "object" ||
      s === null ||
      typeof s.accountId !== "string" ||
      !UUID_RE.test(s.accountId) ||
      !isDateString(s.date) ||
      !isAmount(s.stockValue) ||
      !isAmount(s.cashValue) ||
      !isAmount(s.totalValue) ||
      !isCount(s.holdingCount) ||
      !isCount(s.missingPriceCount) ||
      !(s.oldestPriceDate === null || isDateString(s.oldestPriceDate))
    ) {
      return [];
    }
    return [
      {
        accountId: s.accountId,
        date: s.date,
        stockValue: s.stockValue,
        cashValue: s.cashValue,
        totalValue: s.totalValue,
        holdingCount: s.holdingCount,
        missingPriceCount: s.missingPriceCount,
        oldestPriceDate: s.oldestPriceDate,
      },
    ];
  });
}
