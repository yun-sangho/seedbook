import type { Stock } from "@mobile/features/investments/types/stock";

/**
 * 첫 씨앗 고르기의 추천 카드 — 널리 알려진 자산 배분 예시. 투자 권유로 보이지 않게 비중은 자산군
 * 단위로만 두고, 종목은 사용자가 직접 고른다. 예시 종목은 시드 DB(`packages/database/seed-data/
 * stocks.json`)에 있고 거래 중인 것만 쓴다 (`seed-presets.test.ts` 가 검사).
 */

export const SEED_PRESET_DISCLAIMER =
  "널리 알려진 예시이며 투자 권유가 아니에요. 비중과 종목은 직접 정해요.";

export interface SeedAssetClass {
  id: string;
  label: string;
  /** 자산군 목표 비중 (%). 카드의 비중 합은 100. */
  percent: number;
  /** 검색 전에 눌러 담을 수 있는 예시 종목. */
  examples: readonly Stock[];
}

export interface SeedPreset {
  id: string;
  name: string;
  /** 카드 한 줄 설명. 수익·위험을 약속하는 말은 쓰지 않는다. */
  description: string;
  classes: readonly SeedAssetClass[];
}

const krx = (ticker: string, name: string): Stock => ({
  market: "KOSPI",
  ticker,
  name,
  currency: "KRW",
});

const KODEX_200 = krx("069500", "KODEX 200");
const TIGER_SP500 = krx("360750", "TIGER 미국S&P500");
const KODEX_SP500 = krx("379800", "KODEX 미국S&P500");
const ACE_SP500 = krx("360200", "ACE 미국S&P500");
const KODEX_MSCI_WORLD = krx("251350", "KODEX MSCI선진국");
const TIGER_NASDAQ100 = krx("133690", "TIGER 미국나스닥100");
const KODEX_NASDAQ100 = krx("379810", "KODEX 미국나스닥100");
const KODEX_RUSSELL2000 = krx("280930", "KODEX 미국러셀2000(H)");
const KODEX_200_MIDSMALL = krx("226980", "KODEX 200 중소형");

const KODEX_AGG_BOND = krx("273130", "KODEX 종합채권(AA-이상)액티브");
const KODEX_KTB3 = krx("114260", "KODEX 국고채3년");
const ACE_UST30 = krx("476760", "ACE 미국30년국채액티브");
const KODEX_KTB30 = krx("439870", "KODEX 국고채30년액티브");
const ACE_UST10 = krx("0085P0", "ACE 미국10년국채액티브");
const KIWOOM_KTB10 = krx("148070", "KIWOOM 국고채10년");
const KODEX_SHORT_BOND = krx("153130", "KODEX 단기채권");
const TIGER_UST_BILLS = krx("0046A0", "TIGER 미국초단기(3개월이하)국채");

const ACE_GOLD = krx("411060", "ACE KRX금현물");
const TIGER_GOLD = krx("0072R0", "TIGER KRX금현물");
const KODEX_AGRI = krx("271060", "KODEX 3대농산물선물(H)");
const KODEX_WTI = krx("261220", "KODEX WTI원유선물(H)");
const KODEX_COPPER = krx("138910", "KODEX 구리선물(H)");
const TIGER_CD = krx("357870", "TIGER CD금리투자KIS(합성)");
const TIGER_MMF = krx("0043B0", "TIGER 머니마켓액티브");

const STOCKS = [KODEX_200, TIGER_SP500, KODEX_MSCI_WORLD];
const BONDS = [KODEX_AGG_BOND, KODEX_KTB3];
const LONG_BONDS = [ACE_UST30, KODEX_KTB30];
const GOLD = [ACE_GOLD, TIGER_GOLD];

export const SEED_PRESETS: readonly SeedPreset[] = [
  {
    id: "stocks-70-bonds-30",
    name: "주식 7 : 채권 3",
    description: "주식과 채권을 7:3 으로 나눠요",
    classes: [
      { id: "stocks", label: "주식", percent: 70, examples: STOCKS },
      { id: "bonds", label: "채권", percent: 30, examples: BONDS },
    ],
  },
  {
    id: "sixty-forty",
    name: "6:4 포트폴리오",
    description: "주식 60%, 채권 40% 로 나누는 오래된 기본형이에요",
    classes: [
      { id: "stocks", label: "주식", percent: 60, examples: STOCKS },
      { id: "bonds", label: "채권", percent: 40, examples: BONDS },
    ],
  },
  {
    id: "all-weather",
    name: "올웨더",
    description: "주식·장기채·중기채·금·원자재에 나눠 담아요",
    classes: [
      { id: "stocks", label: "주식", percent: 30, examples: STOCKS },
      { id: "long-bonds", label: "장기채", percent: 40, examples: LONG_BONDS },
      { id: "mid-bonds", label: "중기채", percent: 15, examples: [ACE_UST10, KIWOOM_KTB10] },
      { id: "gold", label: "금", percent: 7.5, examples: GOLD },
      {
        id: "commodities",
        label: "원자재",
        percent: 7.5,
        examples: [KODEX_AGRI, KODEX_WTI, KODEX_COPPER],
      },
    ],
  },
  {
    id: "permanent",
    name: "영구 포트폴리오",
    description: "주식·장기채·금·현금성 자산을 똑같이 나눠요",
    classes: [
      { id: "stocks", label: "주식", percent: 25, examples: STOCKS },
      { id: "long-bonds", label: "장기채", percent: 25, examples: LONG_BONDS },
      { id: "gold", label: "금", percent: 25, examples: GOLD },
      { id: "cash", label: "현금성", percent: 25, examples: [TIGER_CD, TIGER_MMF] },
    ],
  },
  {
    id: "golden-butterfly",
    name: "골든 버터플라이",
    description: "대형주·소형 가치주·장기채·단기채·금을 20% 씩 나눠요",
    classes: [
      { id: "large-caps", label: "대형주", percent: 20, examples: [KODEX_200, TIGER_SP500] },
      {
        id: "small-value",
        label: "소형 가치주",
        percent: 20,
        examples: [KODEX_RUSSELL2000, KODEX_200_MIDSMALL],
      },
      { id: "long-bonds", label: "장기채", percent: 20, examples: LONG_BONDS },
      {
        id: "short-bonds",
        label: "단기채",
        percent: 20,
        examples: [KODEX_SHORT_BOND, TIGER_UST_BILLS],
      },
      { id: "gold", label: "금", percent: 20, examples: GOLD },
    ],
  },
  {
    id: "us-index",
    name: "미국 지수",
    description: "S&P500 과 나스닥100 을 반씩 나눠요",
    classes: [
      {
        id: "sp500",
        label: "S&P500",
        percent: 50,
        examples: [TIGER_SP500, KODEX_SP500, ACE_SP500],
      },
      {
        id: "nasdaq100",
        label: "나스닥100",
        percent: 50,
        examples: [TIGER_NASDAQ100, KODEX_NASDAQ100],
      },
    ],
  },
];

export function findSeedPreset(id: string | null | undefined): SeedPreset | null {
  return SEED_PRESETS.find((preset) => preset.id === id) ?? null;
}
