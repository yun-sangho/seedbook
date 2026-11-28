/**
 * 서버 ↔ 클라이언트 envelope 번역 계층 공통 타입.
 *
 * 각 store 는 `{ state, version }` envelope 를 사용한다. 서버에서 envelope 의
 * 내용을 DB row 로 해체하고, 다시 응답 시 row 들을 envelope 로 조립한다.
 */

import type { Database } from "@seedbook/database";

// 각 translator 는 Drizzle db 핸들을 받아 자체적으로 트랜잭션을 시작한다.
// 호출 측이 이미 transaction 안에서 호출하더라도 Drizzle 의 nested transaction
// (savepoint) 으로 처리되어 동일한 시그니처로 재사용 가능.
export type Db = Database;

/**
 * Translator 가 반환하는 envelope 모양.
 *
 * `state` 는 도메인 별로 다르고 (`investments` 배열, `plans` 배열 등) `version` 은
 * 해당 store 의 현재 persist version 과 동일해야 한다.
 */
export type Envelope = {
  state: Record<string, unknown>;
  version: number;
};

/**
 * 한 도메인의 read / write 번역기.
 *
 * - `read`: DB 에서 userId 에 해당하는 row 들을 읽어 envelope 로 조립.
 * - `write`: 클라이언트가 보낸 envelope 를 받아 DB row 를 upsert + stale row 삭제.
 */
export interface DomainTranslator {
  read(db: Db, userId: string): Promise<Envelope | null>;
  write(db: Db, userId: string, envelope: Envelope): Promise<void>;
}
