/**
 * KRX 정보데이터시스템 크롤러
 * http://data.krx.co.kr 에서 전 종목 목록 및 시세 데이터를 가져옵니다.
 */

export interface KrxStockItem {
  ISU_CD: string; // ISIN 코드
  ISU_SRT_CD: string; // 단축코드 (6자리)
  ISU_NM: string; // 종목명
  MKT_NM: string; // 시장구분 (KOSPI/KOSDAQ/KONEX)
  SECT_TP_NM: string; // 업종
  TDD_CLSPRC: string; // 종가
  TDD_OPNPRC: string; // 시가
  TDD_HGPRC: string; // 고가
  TDD_LWPRC: string; // 저가
  ACC_TRDVOL: string; // 거래량
  MKTCAP: string; // 시가총액
  CMPPREVDD_PRC: string; // 전일대비
  LIST_DD: string; // 상장일
}

interface KrxResponse {
  OutBlock_1: KrxStockItem[];
}

const KRX_BASE_URL =
  "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
  "Content-Type": "application/x-www-form-urlencoded",
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parseNumber(value: string): bigint {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return 0n;
  return BigInt(cleaned);
}

export async function fetchAllStocksWithPrices(
  date?: Date,
): Promise<KrxStockItem[]> {
  const trdDd = formatDate(date ?? new Date());

  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT01501",
    locale: "ko_KR",
    mktId: "ALL",
    trdDd,
    share: "1",
    money: "1",
    csvxls_is498: "false",
  });

  const response = await fetch(KRX_BASE_URL, {
    method: "POST",
    headers: HEADERS,
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`KRX request failed: ${response.status}`);
  }

  const data = (await response.json()) as KrxResponse;
  return data.OutBlock_1 ?? [];
}

export function parseStockList(items: KrxStockItem[]) {
  return items.map((item) => ({
    market: item.MKT_NM,
    ticker: item.ISU_SRT_CD,
    name: item.ISU_NM,
    currency: "KRW",
    sector: item.SECT_TP_NM || null,
  }));
}

export function parsePriceData(items: KrxStockItem[], date: Date) {
  return items
    .filter((item) => parseNumber(item.TDD_CLSPRC) > 0n)
    .map((item) => ({
      stockMarket: item.MKT_NM,
      stockTicker: item.ISU_SRT_CD,
      date,
      open: parseNumber(item.TDD_OPNPRC),
      high: parseNumber(item.TDD_HGPRC),
      low: parseNumber(item.TDD_LWPRC),
      close: parseNumber(item.TDD_CLSPRC),
      volume: parseNumber(item.ACC_TRDVOL),
      marketCap: parseNumber(item.MKTCAP),
      change: parseNumber(item.CMPPREVDD_PRC),
    }));
}
