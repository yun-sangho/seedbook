import { normalizeHarvest } from "@mobile/features/garden/utils/normalize-harvest";
import { normalizeInvestment } from "@mobile/features/investments/utils/normalize-investment";
import { normalizePortfolio } from "@mobile/features/portfolio/utils/normalize-portfolio";
import { normalizeSession } from "@mobile/features/rebalancing/utils/normalize-session";
import { type RecordStoreKey, STORE_SHAPES } from "./v2/store-records";

/** store 별 목록 항목 정리 (입력 도중의 NaN·null 등을 레코드 정의가 받는 값으로). */
// biome-ignore lint/suspicious/noExplicitAny: store 마다 항목 타입이 달라 한 표에 담는다.
const NORMALIZE_ITEM: Record<RecordStoreKey, (item: any) => unknown> = {
  "investment-storage": normalizeInvestment,
  "portfolio-storage": normalizePortfolio,
  "rebalancing-storage": normalizeSession,
  "harvest-storage": normalizeHarvest,
};

/**
 * persist envelope (`{ state, version }`) 의 목록 항목을 저장 전·읽은 뒤에 정리한다. 레코드 정의는
 * `null` 을 받지 않으므로(검증에 걸리면 격리) 화면이 만든 NaN(직렬화하면 null) 은 여기서 0 으로 고친다.
 * 기기 레코드에 두는 store 가 아니거나 envelope 가 아닌 값은 그대로 둔다. 고칠 것이 없으면 받은
 * 문자열을 그대로 돌려준다.
 */
export function normalizePersistedEnvelope(key: string, value: string): string {
  if (!Object.hasOwn(NORMALIZE_ITEM, key)) return value;
  const normalizeItem = NORMALIZE_ITEM[key as RecordStoreKey];
  const itemsField = STORE_SHAPES[key as RecordStoreKey].listField;
  let envelope: { state?: Record<string, unknown> } & Record<string, unknown>;
  try {
    envelope = JSON.parse(value);
  } catch {
    return value;
  }
  const items = envelope?.state?.[itemsField];
  if (!Array.isArray(items)) return value;

  const normalized = items.map((item) => normalizeItem(item));
  // 값이 같으면 원래 문자열을 그대로 둔다 (불필요한 재직렬화 차이를 만들지 않는다).
  if (JSON.stringify(normalized) === JSON.stringify(items)) return value;
  return JSON.stringify({
    ...envelope,
    state: { ...envelope.state, [itemsField]: normalized },
  });
}
