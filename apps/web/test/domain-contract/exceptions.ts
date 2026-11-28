import type { RecordType } from "@seedbook/domain";

/**
 * 레코드 정의(`packages/domain`) 와 지금 코드의 대조에서 뺄 것. 이유 없이 넣지 않는다.
 *
 * - `PLANNED`: 정의(설계)에는 있지만 아직 코드에 없는 것. 그 단계 PR 이 코드를 추가하면 대조 테스트가
 *   "이미 있다" 로 실패하니 여기서 지운다.
 * - `LEGACY`: 코드에는 있지만 정의에 넣지 않는 것. v2-5 (contract) 에서 지운다.
 */

/** 아직 서버 테이블이 없는 레코드 → 만들 단계. */
export const PLANNED_SERVER_TABLES: Partial<Record<RecordType, string>> = {};

/** 아직 서버에 없는 컬럼 (레코드 → 컬럼 → 단계). */
export const PLANNED_SERVER_COLUMNS: Partial<Record<RecordType, Record<string, string>>> = {};

/** 서버에 있지만 정의에 넣지 않는 컬럼 (레코드 → 컬럼 → 이유). */
export const LEGACY_SERVER_COLUMNS: Partial<Record<RecordType, Record<string, string>>> = {
  account: {
    sellCostPercent: "계산에 쓰지 않는 옛 매도 제비용률 — v2-5 에서 컬럼 제거 (사용자 결정)",
  },
  portfolio: {
    accountIds: "연결의 원본은 account.portfolioId — v2-5 에서 제거 (설계 §2.4)",
    description: "클라이언트에 없는 옛 컬럼 — v2-5 에서 제거",
  },
  rebalancing: { tasks: "rebalancingTask 레코드로 옮긴다 — v2-5 에서 제거 (설계 §2.4)" },
  settings: {
    storageMode: "저장 모드는 동기화 밖 계정 상태 (사용자 결정)",
    storageModeChosenAt: "저장 모드는 동기화 밖 계정 상태 (사용자 결정)",
  },
};

/**
 * 지금 클라이언트·서버 검증에 없는 필드 (레코드 → 필드 → 단계). 클라이언트 타입·동기화 설정·
 * 서버 검증 대조에서 뺀다.
 */
export const PLANNED_CLIENT_FIELDS: Partial<Record<RecordType, Record<string, string>>> = {
  account: { portfolioId: "v2-4b: 지금은 portfolio.accountIds 가 원본" },
  rebalancingTask: { allocationId: "v2-4b: 지금은 task.id" },
};
