/**
 * 기기 SQLite 에 문장을 보내는 최소 인터페이스. 앱에서는 Capacitor 플러그인
 * (`capacitor-driver.ts`), 테스트에서는 Node 내장 `node:sqlite` 로 구현한다.
 */

export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

export interface SqlDriver {
  query: <T = Record<string, unknown>>(sql: string, params?: SqlValue[]) => Promise<T[]>;
  /** 문장들을 한 트랜잭션으로 실행한다 — 하나라도 실패하면 모두 되돌린다. */
  batch: (statements: SqlStatement[]) => Promise<void>;
}
