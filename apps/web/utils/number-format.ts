/**
 * 숫자를 한글 금액 단위(만원, 억원, 조원)로 변환하는 함수
 */
export function numberToKorean(num: string | number): string {
  if ((!num && num !== 0) || (typeof num === "string" && isNaN(Number(num)))) return "";

  const number = typeof num === "string" ? Number(num) : num;
  if (number === 0) return "0만원";

  // 조 단위 (1조 = 100,000억 = 1,000,000만)
  if (number >= 1000000) {
    const jo = Math.floor(number / 1000000); // 조 단위
    const remainder = number % 1000000; // 조 단위 이하

    if (remainder === 0) {
      return `${jo}조원`;
    }

    // 억 단위 처리
    const eok = Math.floor(remainder / 10000); // 억 단위
    const man = remainder % 10000; // 만 단위

    if (eok === 0) {
      return `${jo}조${man}만원`;
    } else if (man === 0) {
      return `${jo}조${eok}억원`;
    } else {
      return `${jo}조${eok}억${man}만원`;
    }
  }
  // 억 단위 (1억 = 10,000만)
  else if (number >= 10000) {
    const eok = Math.floor(number / 10000); // 억 단위
    const man = number % 10000; // 만 단위

    if (man === 0) {
      return `${eok}억원`;
    } else {
      return `${eok}억${man}만원`;
    }
  }
  // 만 단위만 있는 경우
  else {
    return `${number}만원`;
  }
}

/**
 * 문자열 형식의 숫자에서 쉼표를 제거하고 숫자로 파싱하는 함수
 */
export function parseNumericString(value: string): number {
  return parseFloat(value.replace(/,/g, ""));
}

/**
 * 숫자에 쉼표를 추가하는 함수
 */
export function formatWithCommas(num: number): string {
  return num.toLocaleString();
}

/**
 * 수익률을 계산하는 함수 (%)
 * @param currentValue 현재 가치
 * @param initialInvestment 초기 투자금
 * @returns 수익률 (백분율)
 */
export function calculateReturnRate(currentValue: number, initialInvestment: number): number {
  const current = currentValue;
  const initial = initialInvestment;

  if (!initial || initial === 0) return 0;

  return ((current - initial) / initial) * 100;
}

/**
 * 수익률을 포맷팅하는 함수
 * @param rate 수익률 (백분율)
 * @returns 포맷팅된 수익률 (예: +12.34% 또는 -5.67%)
 */
export function formatReturnRate(rate: number): string {
  const sign = rate >= 0 ? "+" : "-";
  return `${sign}${Math.abs(rate).toFixed(2)}%`;
}

/**
 * 원화 표시된 문자열에서 가장 높은 단위만 남기고 한 자리 소수점으로 표시하는 함수
 * @param koreanCurrency 원화 단위 문자열 (예: '1억2345만원', '1조3453억1234만원')
 * @returns 높은 단위만 남긴 문자열 (예: '1.2억원', '1.3조원')
 */
export function truncateToHighestDenomination(koreanCurrency: string): string {
  // 입력이 없거나 유효하지 않은 경우 원래 문자열 반환
  if (!koreanCurrency) return koreanCurrency;

  try {
    // 조 단위가 있는 경우
    if (koreanCurrency.includes("조")) {
      const joMatch = koreanCurrency.match(/(\d+)조/);
      if (!joMatch || !joMatch[1]) return koreanCurrency;

      const joValue = parseInt(joMatch[1]!);

      // 억 단위 추출 (소수점 계산용)
      let decimalPart = 0;
      const eokMatch = koreanCurrency.match(/(\d+)억/);
      if (eokMatch && eokMatch[1]) {
        decimalPart = parseInt(eokMatch[1]!) / 10000;
      }

      const total = joValue + decimalPart;
      if (decimalPart === 0) return `${joValue}조원`;
      return `${total.toFixed(1)}조원`;
    }
    // 억 단위가 있는 경우
    else if (koreanCurrency.includes("억")) {
      const eokMatch = koreanCurrency.match(/(\d+)억/);
      if (!eokMatch || !eokMatch[1]) return koreanCurrency;

      const eokValue = parseInt(eokMatch[1]!);

      // 만 단위 추출 (소수점 계산용)
      let decimalPart = 0;
      const manMatch = koreanCurrency.match(/(\d+)만/);
      if (manMatch && manMatch[1]) {
        decimalPart = parseInt(manMatch[1]!) / 10000;
      }

      if (decimalPart === 0) return `${eokValue}억원`;

      const total = eokValue + decimalPart;
      return `${total.toFixed(1)}억원`;
    }
  } catch (error) {
    console.error("Error in truncateToHighestDenomination:", error);
  }

  // 만 단위만 있거나 다른 형식인 경우 원래 문자열 반환
  return koreanCurrency;
}
