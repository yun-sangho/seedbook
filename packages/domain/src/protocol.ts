import type { Rejection } from "./parse-patch";
import { MIN_SCHEMA, SCHEMA_VERSION } from "./version";

/**
 * 동기화 전송 프로토콜 v2 (설계 §4). 서버 핸들러와 클라이언트 동기화 계층이 같이 쓴다.
 */

/** 전송 형식 버전 (`x-seedbook-sync`). 바뀌면 깨는 변경과 같게 다룬다 (§7.6). */
export const SYNC_PROTOCOL = 2;

export const SYNC_HEADERS = {
  /** 프로토콜 정수. */
  protocol: "x-seedbook-sync",
  /** 앱의 데이터 버전 (`SCHEMA_VERSION`). */
  schema: "x-seedbook-schema",
  /** 앱 번들 버전 — 로그용. */
  client: "x-seedbook-client",
} as const;

/** 한 push 요청의 최대 op 수. outbox 가 길면 클라이언트가 나눠 보낸다. */
export const MAX_PUSH_OPS = 200;
/** push 본문 최대 크기 (바이트). */
export const MAX_PUSH_BYTES = 1_000_000;
export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 1000;

export type SyncOpKind = "create" | "patch" | "delete";

export interface SyncOp {
  type: string;
  id: string;
  /** 하위 레코드의 부모 id. `create` 에만 쓰고, 부모는 바꿀 수 없다. */
  parentId?: string;
  op: SyncOpKind;
  /** 바꾼 필드만 (`create` 는 전체). 없는 필드는 "모름"이지 "비움"이 아니다. */
  fields?: Record<string, unknown>;
  /** 목록 순서 (분수 인덱스). 정렬하는 레코드만. */
  sortKey?: string;
}

/** op 를 통째로 받지 않은 이유. */
export type OpRejectCode =
  | "invalid"
  | "forbidden"
  | "deleted"
  | "parent_deleted"
  | "parent_missing"
  | "not_found";

/** op 하나의 결과. `changeSeq` 는 bigint 라 문자열이다. */
export type SyncOpResult =
  | { status: "ok"; version?: number; changeSeq?: string }
  | { status: "partial"; version: number; changeSeq: string; rejected: Rejection[] }
  | { status: "rejected"; code: OpRejectCode; rejected?: Rejection[] };

export interface PushResponse {
  results: SyncOpResult[];
}

/** pull 로 받는 레코드 하나. `fields` 는 언제나 전체다. */
export interface PulledRecord {
  type: string;
  id: string;
  parentId: string | null;
  version: number;
  changeSeq: string;
  deletedAt: string | null;
  sortKey: string | null;
  fields: Record<string, unknown>;
}

export interface PullResponse {
  protocol: typeof SYNC_PROTOCOL;
  records: PulledRecord[];
  /** 다음 pull 에 넘길 불투명한 값. */
  cursor: string;
  hasMore: boolean;
  /** 서버가 데이터를 다시 만들었다 — 커서를 버리고 처음부터 받은 것이다 (outbox 는 유지). */
  reset: boolean;
}

/**
 * 앱의 데이터 버전을 서버가 받는지 (설계 §7.1). 서버 스키마는 확장만 하므로 `[MIN_SCHEMA,
 * SCHEMA_VERSION]` 안이면 버전과 상관없이 같은 코드로 처리한다 (변환 없음).
 * - `too_old`: 깨는 변경 전 앱 → 426, 업데이트가 필요하다.
 * - `ahead`: 서버 배포보다 먼저 깔린 앱 → 409, 앱은 조용히 기다린다.
 */
export function checkSchemaVersion(
  schema: number,
  range: { min: number; current: number } = { min: MIN_SCHEMA, current: SCHEMA_VERSION }
): "ok" | "too_old" | "ahead" {
  if (schema < range.min) return "too_old";
  if (schema > range.current) return "ahead";
  return "ok";
}
