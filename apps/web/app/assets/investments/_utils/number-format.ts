/**
 * 숫자를 한글 금액 단위(만원, 억원, 조원)로 변환하는 함수
 */
export function numberToKorean(num: string): string {
  if (!num || isNaN(Number(num))) return "";

  const number = Number(num);
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
