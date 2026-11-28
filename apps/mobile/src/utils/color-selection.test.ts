import { describe, expect, it } from "vitest";
import { getColorFamily, getNextColor } from "./color-selection";

describe("color-selection utils", () => {
  // 테스트용 색상 팔레트 (3개 계열 × 3개 색상)
  const TEST_COLORS = [
    "#ff0000", // RED-1
    "#ff3333", // RED-2
    "#ff6666", // RED-3
    "#00ff00", // GREEN-1
    "#33ff33", // GREEN-2
    "#66ff66", // GREEN-3
    "#0000ff", // BLUE-1
    "#3333ff", // BLUE-2
    "#6666ff", // BLUE-3
  ] as const;

  const TEST_COLOR_FAMILIES = {
    RED: TEST_COLORS.slice(0, 3),
    GREEN: TEST_COLORS.slice(3, 6),
    BLUE: TEST_COLORS.slice(6, 9),
  } as const;

  describe("getColorFamily", () => {
    it("should return correct family name for a color", () => {
      expect(getColorFamily("#ff0000", TEST_COLOR_FAMILIES)).toBe("RED");
      expect(getColorFamily("#00ff00", TEST_COLOR_FAMILIES)).toBe("GREEN");
      expect(getColorFamily("#0000ff", TEST_COLOR_FAMILIES)).toBe("BLUE");
    });

    it("should return null for unknown color", () => {
      expect(getColorFamily("#ffffff", TEST_COLOR_FAMILIES)).toBeNull();
      expect(getColorFamily("#000000", TEST_COLOR_FAMILIES)).toBeNull();
    });

    it("should handle any color within the family", () => {
      expect(getColorFamily("#ff3333", TEST_COLOR_FAMILIES)).toBe("RED");
      expect(getColorFamily("#66ff66", TEST_COLOR_FAMILIES)).toBe("GREEN");
      expect(getColorFamily("#6666ff", TEST_COLOR_FAMILIES)).toBe("BLUE");
    });
  });

  describe("getNextColor", () => {
    it("should return first color when no colors are used", () => {
      const result = getNextColor([], TEST_COLORS, TEST_COLOR_FAMILIES);
      expect(result).toBe("#ff0000"); // RED-1
    });

    it("should select from unused color family first", () => {
      // RED 계열 사용 중
      const usedColors = ["#ff0000", "#ff3333"];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // GREEN 또는 BLUE 계열 중 하나여야 함 (RED가 아님)
      const family = getColorFamily(result, TEST_COLOR_FAMILIES);
      expect(family).not.toBe("RED");
      expect(["GREEN", "BLUE"]).toContain(family);
    });

    it("should select unused color within same family if other families are also used", () => {
      // 각 계열별로 1개씩 사용
      const usedColors = ["#ff0000", "#00ff00", "#0000ff"];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // 사용하지 않은 색상이어야 함
      expect(usedColors).not.toContain(result);
      expect(TEST_COLORS).toContain(result);
    });

    it("should select from least used family when all colors in some families are used", () => {
      // RED: 전체 사용 (3개), GREEN: 전체 사용 (3개), BLUE: 일부 사용 (1개)
      const usedColors = [
        "#ff0000",
        "#ff3333",
        "#ff6666",
        "#00ff00",
        "#33ff33",
        "#66ff66",
        "#0000ff",
      ];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // BLUE 계열의 사용하지 않은 색상이어야 함 (BLUE가 가장 적게 사용됨)
      const family = getColorFamily(result, TEST_COLOR_FAMILIES);
      expect(family).toBe("BLUE");
      expect(usedColors).not.toContain(result);
    });

    it("should select least used color when all colors are used", () => {
      // 모든 색상이 1번씩 사용됨
      const usedColors = [...TEST_COLORS];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // 결과는 팔레트에 있는 색상이어야 함
      expect(TEST_COLORS).toContain(result);
    });

    it("should select least used color from least used family when all colors are used", () => {
      // RED: 각 색상 2번씩 (총 6번)
      // GREEN: 각 색상 1번씩 (총 3번)
      // BLUE: 각 색상 1번씩 (총 3번)
      const usedColors = [
        "#ff0000",
        "#ff0000",
        "#ff3333",
        "#ff3333",
        "#ff6666",
        "#ff6666",
        "#00ff00",
        "#33ff33",
        "#66ff66",
        "#0000ff",
        "#3333ff",
        "#6666ff",
      ];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // GREEN 또는 BLUE 계열이어야 함 (RED보다 적게 사용됨)
      const family = getColorFamily(result, TEST_COLOR_FAMILIES);
      expect(["GREEN", "BLUE"]).toContain(family);
    });

    it("should maintain diversity with sequential additions", () => {
      const usedColors: string[] = [];
      const selectedFamilies: string[] = [];

      // 처음 3개 색상 선택 시 모두 다른 계열이어야 함
      for (let i = 0; i < 3; i++) {
        const nextColor = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);
        const family = getColorFamily(nextColor, TEST_COLOR_FAMILIES);

        selectedFamilies.push(family!);
        usedColors.push(nextColor);
      }

      // 첫 3개는 모두 다른 계열이어야 함
      const uniqueFamilies = new Set(selectedFamilies);
      expect(uniqueFamilies.size).toBe(3);
      expect(uniqueFamilies).toContain("RED");
      expect(uniqueFamilies).toContain("GREEN");
      expect(uniqueFamilies).toContain("BLUE");
    });

    it("should handle empty color families gracefully", () => {
      const emptyFamilies = {};
      const result = getNextColor([], TEST_COLORS, emptyFamilies);

      // 빈 계열이어도 첫 번째 사용 가능한 색상 반환
      expect(result).toBe("#ff0000");
    });

    it("should prioritize unused family over unused color in used family", () => {
      // RED 계열: 1개 사용
      // GREEN 계열: 전체 사용 (3개)
      // BLUE 계열: 미사용
      const usedColors = ["#ff0000", "#00ff00", "#33ff33", "#66ff66"];

      const result = getNextColor(usedColors, TEST_COLORS, TEST_COLOR_FAMILIES);

      // BLUE 계열이 선택되어야 함 (완전히 미사용된 계열)
      expect(getColorFamily(result, TEST_COLOR_FAMILIES)).toBe("BLUE");
    });
  });
});
