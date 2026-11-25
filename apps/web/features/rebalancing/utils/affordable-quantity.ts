/** 쓸 수 있는 금액으로 이 가격에 살 수 있는 최대 수량 (주). 살 수 없으면 0. */
export function affordableQuantity(cash: number, price: number): number {
  if (price <= 0 || cash <= 0) return 0;
  return Math.floor(cash / price);
}
