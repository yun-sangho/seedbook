/**
 * 자산 진행 상황(Progress) 타입 정의
 */

/**
 * 자산 진행 포인트 - 특정 날짜의 자산 스냅샷
 */
export interface AssetProgressPoint {
  date: string; // YYYY-MM-DD 형식
  totalAssets: number; // 총 자산 (투자 + 저축 + 실물자산)
  netAssets: number; // 순자산 (총 자산 - 부채)
  investments: number; // 투자 총액
  savings: number; // 저축 총액
  realAssets: number; // 실물자산 총액
  loans: number; // 부채 총액
}

/**
 * 차트 뷰 타입
 */
export type AssetProgressView = "totalAssets" | "netAssets" | "loans";

/**
 * 차트 뷰 레이블 매핑
 */
export const ASSET_PROGRESS_VIEW_LABELS: Record<AssetProgressView, string> = {
  totalAssets: "자산 총액",
  netAssets: "순자산",
  loans: "부채",
};
