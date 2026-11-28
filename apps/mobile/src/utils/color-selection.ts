/**
 * 색상 선택 유틸리티
 * 계좌/투자 항목에 자동으로 색상을 할당하는 로직 제공
 */

/**
 * 색상 계열 분류
 */
export interface ColorFamilies {
  [key: string]: readonly string[];
}

/**
 * 색상이 속한 계열 이름 반환
 */
export function getColorFamily(color: string, colorFamilies: ColorFamilies): string | null {
  for (const [familyName, colors] of Object.entries(colorFamilies)) {
    if (colors.includes(color)) {
      return familyName;
    }
  }
  return null;
}

/**
 * 다음 사용 가능한 색상 선택
 *
 * 우선순위:
 * 1. 아직 사용하지 않은 색상 계열에서 선택
 * 2. 사용하지 않은 개별 색상 선택
 * 3. 가장 적게 사용된 계열에서 가장 적게 사용된 색상 선택
 *
 * @param usedColors - 현재 사용 중인 색상 배열
 * @param availableColors - 사용 가능한 전체 색상 배열
 * @param colorFamilies - 색상 계열 그룹 객체
 * @returns 선택된 색상
 */
export function getNextColor(
  usedColors: string[],
  availableColors: readonly string[],
  colorFamilies: ColorFamilies
): string {
  // 색상 계열별 사용 현황 파악
  const familyUsageCount = new Map<string, number>();
  const colorUsageCount = new Map<string, number>();

  // 초기화
  Object.keys(colorFamilies).forEach((family) => {
    familyUsageCount.set(family, 0);
  });
  availableColors.forEach((color) => {
    colorUsageCount.set(color, 0);
  });

  // 사용 중인 색상 카운트
  usedColors.forEach((color) => {
    // 개별 색상 카운트
    const count = colorUsageCount.get(color) || 0;
    colorUsageCount.set(color, count + 1);

    // 색상 계열 카운트
    const family = getColorFamily(color, colorFamilies);
    if (family) {
      const familyCount = familyUsageCount.get(family) || 0;
      familyUsageCount.set(family, familyCount + 1);
    }
  });

  // 1. 아직 사용하지 않은 색상 계열 찾기
  const unusedFamilies = Array.from(familyUsageCount.entries())
    .filter(([, count]) => count === 0)
    .map(([family]) => family);

  if (unusedFamilies.length > 0) {
    // 사용하지 않은 계열 중 첫 번째 계열의 첫 번째 색상 반환
    const firstUnusedFamily = unusedFamilies[0]!;
    const familyColors = colorFamilies[firstUnusedFamily];
    return familyColors![0]!;
  }

  // 2. 아직 사용되지 않은 개별 색상 찾기 (같은 계열 내에서도)
  const unusedColor = availableColors.find((color) => !usedColors.includes(color));
  if (unusedColor) {
    return unusedColor;
  }

  // 3. 모든 색상이 사용 중이면, 가장 적게 사용된 계열에서 가장 적게 사용된 색상 선택
  let minFamilyCount = Infinity;
  let leastUsedFamily = "";

  familyUsageCount.forEach((count, family) => {
    if (count < minFamilyCount) {
      minFamilyCount = count;
      leastUsedFamily = family;
    }
  });

  // 해당 계열 내에서 가장 적게 사용된 색상 찾기
  const familyColors = colorFamilies[leastUsedFamily] || [];
  let minColorCount = Infinity;
  let leastUsedColor = familyColors[0]!;

  familyColors.forEach((color) => {
    const count = colorUsageCount.get(color) || 0;
    if (count < minColorCount) {
      minColorCount = count;
      leastUsedColor = color;
    }
  });

  return leastUsedColor;
}
