import type { StockPriceKind, StockPricePoint } from "./use-stock-prices";

/**
 * 화면에 보여줄 "이 금액은 언제 가격 기준인가" 요약.
 * 여러 종목 중 가장 최근 가격을 기준으로 삼고, 그보다 눈에 띄게 오래된 종목이
 * 섞여 있으면 (거래정지, 시세 소스 실패 등) `hasLagging` 으로 알린다.
 */
export interface PriceAsOfSummary {
  asOf: string;
  kind: StockPriceKind;
  hasLagging: boolean;
}

export interface PriceAsOfLabel {
  title: string;
  description?: string;
  tone: "informative" | "neutral";
}

/** 이 정도 차이는 같은 시점으로 본다 (장중 갱신 주기 몇 번 분량). */
const LAGGING_THRESHOLD_MS = 10 * 60 * 1000;

const KST = "Asia/Seoul";
const dayFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "long",
  day: "numeric",
});
const weekdayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const kstDateKey = new Intl.DateTimeFormat("en-CA", { timeZone: KST });

export function summarizePriceAsOf(
  points: Iterable<Pick<StockPricePoint, "asOf" | "kind">>
): PriceAsOfSummary | null {
  const list = [...points];
  if (list.length === 0) return null;

  const latest = list.reduce((a, b) => (Date.parse(b.asOf) > Date.parse(a.asOf) ? b : a));
  const latestMs = Date.parse(latest.asOf);
  const hasLagging = list.some((p) => latestMs - Date.parse(p.asOf) > LAGGING_THRESHOLD_MS);

  return { asOf: latest.asOf, kind: latest.kind, hasLagging };
}

/** "오늘" 또는 "11월 6일 (금)" (KST). */
function dayLabel(at: Date, now: Date): string {
  if (kstDateKey.format(at) === kstDateKey.format(now)) return "오늘";
  return `${dayFormat.format(at)} (${weekdayFormat.format(at)})`;
}

export function describePriceAsOf(summary: PriceAsOfSummary, now: Date): PriceAsOfLabel {
  const at = new Date(summary.asOf);
  const description = summary.hasLagging ? "일부 종목은 이전 시세로 계산했어요" : undefined;

  if (summary.kind === "realtime") {
    return {
      title: `실시간 시세 · ${dayLabel(at, now)} ${timeFormat.format(at)} 기준`,
      description,
      tone: "informative",
    };
  }
  return { title: `${dayLabel(at, now)} 종가 기준`, description, tone: "neutral" };
}
