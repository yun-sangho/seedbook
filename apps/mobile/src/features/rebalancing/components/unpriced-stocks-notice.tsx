import { Callout } from "@mobile/seed-design/ui/callout";
import type { UnpricedStock } from "../utils/start-block";

/**
 * 시세를 모르는 포트폴리오 종목 안내 — 왜 시작할 수 없는지와 다음 행동. 불러오는 중인 종목은
 * 잠깐이라 여기서 알리지 않는다 (시작 버튼이 알린다).
 * - `blocking`: 새 리밸런싱을 막는다. 아니면 (이미 진행 중) 시세를 모른다는 것만 알린다.
 */
export function UnpricedStocksNotice({
  stocks,
  blocking,
}: {
  stocks: readonly UnpricedStock[];
  blocking: boolean;
}) {
  const missing = stocks.filter((s) => s.reason === "missing");
  const failed = stocks.filter((s) => s.reason === "failed");
  if (missing.length === 0 && failed.length === 0) return null;

  return (
    <Callout
      tone={blocking ? "critical" : "warning"}
      title={
        blocking
          ? "시세를 모르는 종목이 있어 리밸런싱을 시작할 수 없어요"
          : "시세를 모르는 종목이 있어요"
      }
      description={
        <span className="flex flex-col gap-x1">
          {failed.length > 0 && (
            <span>
              {names(failed)}: 시세를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 확인해 주세요.
            </span>
          )}
          {missing.length > 0 && (
            <span>
              {names(missing)}: 시세를 찾을 수 없어요. 상장폐지됐거나 거래되지 않는 종목일 수
              있어요.
            </span>
          )}
          {blocking && missing.length > 0 && (
            <span>
              다시 확인해도 같으면 포트폴리오의 종목 비중에서 빼거나 다른 종목으로 바꿔 주세요. 그
              종목을 보유 중이면 계좌에서도 정리해야 시작할 수 있어요.
            </span>
          )}
        </span>
      }
    />
  );
}

function names(stocks: readonly UnpricedStock[]): string {
  return stocks.map((s) => s.name).join(", ");
}
