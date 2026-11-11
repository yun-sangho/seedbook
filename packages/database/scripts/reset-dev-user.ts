/**
 * dev 사용자 데이터를 테스트 시나리오(`seed-data/user-data.json`)로 되돌린다.
 *
 * 실행: 루트에서 `pnpm db:seed:reset` — dev stock-crawler 이미지로 일회용 컨테이너를 띄워 돌린다
 * (컨테이너의 DATABASE_URL 이 dev postgres 를 가리킨다). postgres 가 떠 있어야 한다 (`pnpm db:dev:up`).
 *
 * 계좌·포트폴리오·리밸런싱·개인 설정을 시나리오로 바꾼다 (`resetDevUserData`). 로컬 DB
 * (localhost / 127.0.0.1 / 도커의 postgres) 에서만 돈다 — 원격 DB 를 가리키면 거절한다.
 *
 * 브라우저 반영: cloud 모드면 다음 동기화에서 바뀐다. local 모드면 이 브라우저에만 저장돼
 * 있으니 관리 화면의 "데모 데이터 불러오기" 로 같은 시나리오를 넣는다.
 */

import { DEV_USER_ID } from "../src/dev-auth";
import { ensureDevAuth } from "../src/ensure-dev-auth";
import { resetDevUserData } from "./dev-user-data";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/**
 * 연결 문자열의 host. `postgresql://[user[:pass]@]host[:port][/db][?...]` — 비밀번호에 URL 로
 * 못 읽는 문자가 있어도, user 정보가 없어도 된다. 알아볼 수 없으면 빈 문자열 (→ 거절).
 */
function databaseHost(url: string): string {
  const rest = url.replace(/^[a-z]+:\/\//i, "");
  const atIndex = rest.lastIndexOf("@");
  const hostPart = (atIndex >= 0 ? rest.slice(atIndex + 1) : rest).split(/[/?]/)[0] ?? "";
  if (hostPart.startsWith("[")) return hostPart.slice(1, hostPart.indexOf("]"));
  return hostPart.split(":")[0] ?? "";
}

function assertLocalDatabase(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[reset] refusing to run with NODE_ENV=production");
  }
  // `db` 가 연결에 쓰는 값 (`src/client.ts`) 과 같은 변수를 본다.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[reset] DATABASE_URL is not set");
  const host = databaseHost(url);
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`[reset] refusing to reset a non-local database (host: ${host})`);
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();
  await ensureDevAuth();
  await resetDevUserData(DEV_USER_ID);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
