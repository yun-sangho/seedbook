import { privacy20261125 } from "./documents/privacy-2026-11-25";
import { privacy20261128 } from "./documents/privacy-2026-11-28";
import { privacy20261130 } from "./documents/privacy-2026-11-30";
import { privacy20261201 } from "./documents/privacy-2026-12-01";
import { terms20261125 } from "./documents/terms-2026-11-25";
import { terms20261130 } from "./documents/terms-2026-11-30";
import type { LegalDocumentVersion } from "./types";

export * from "./markdown";
export * from "./types";

/**
 * 레포에 있는 모든 버전. 새 버전은 `documents/` 에 파일을 추가하고 여기에 넣는다.
 * `db:legal:publish` 가 이 목록을 DB 에 공개하고, 웹은 DB 를 읽지 못할 때 이 목록으로 대신 보여 준다.
 */
export const LEGAL_DOCUMENT_VERSIONS: readonly LegalDocumentVersion[] = [
  terms20261125,
  privacy20261125,
  privacy20261128,
  terms20261130,
  privacy20261130,
  privacy20261201,
];
