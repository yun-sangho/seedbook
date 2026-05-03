import { describe, it } from "vitest";

/**
 * Drizzle 전환 후 translator round-trip 테스트는 재작성 대기 중.
 *
 * 기존엔 Prisma 의 in-memory mock (mock-prisma.test-util.ts) 으로 검증했지만,
 * Drizzle 의 query 인터페이스는 lower-level (select/insert/update/delete) 라
 * 동등한 mock 을 만들기 어렵다. 옵션:
 *
 *   - pg-mem 같은 in-memory Postgres 로 실제 SQL 실행
 *   - Vitest container fixture 로 실제 Postgres 컨테이너 띄우기
 *   - 타입 안전한 high-level mock builder 직접 구현
 *
 * 단기적으로는 배포 환경에서 e2e 검증으로 대체. 별도 PR 에서 채워 넣을 것.
 */

describe("translator round-trip (Drizzle)", () => {
  it.todo("investment write+read");
  it.todo("savings write+read");
  it.todo("debts write+read");
  it.todo("real-assets write+read");
  it.todo("asset-plan write+read");
  it.todo("portfolio write+read");
  it.todo("progress write+read");
});
