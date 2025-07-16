/**
 * 실물자산 아이템 타입
 */
export interface RealAssetItem {
  id: number;
  assetName: string;
  assetType: string; // 실물자산 유형 (부동산, 자동차, 귀금속 등)
  assetOwner: string; // 자산 소유자
  currentValue: number; // 현재 가치 (원)
  purchaseValue: number; // 구입 가치 (원)
  purchaseDate: string; // 구입 날짜 (YYYY-MM-DD)
  note: string; // 메모
}
