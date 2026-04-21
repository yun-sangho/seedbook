import { describe, expect, it } from "vitest";
import { generateShareCode } from "./generate-code";

/**
 * `canViewData` 는 Prisma 에 의존하므로 여기서는 코드 생성 순수 함수만 검증한다.
 * canViewData 의 권한 로직은 통합 테스트 (API 라우트 테스트) 에서 검증.
 */

describe("generateShareCode", () => {
  it("base64url 알파벳 [A-Za-z0-9_-] 만 사용한다", () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateShareCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("9 bytes base64url 인코딩이라 12 글자다", () => {
    const code = generateShareCode();
    expect(code.length).toBe(12);
  });

  it("매 호출마다 서로 다른 값이다 (난수)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      codes.add(generateShareCode());
    }
    // 72 bits 엔트로피에서 500 샘플은 충돌 가능성이 사실상 0.
    expect(codes.size).toBe(500);
  });
});
