/**
 * DB 통합 테스트용 Postgres URL.
 *
 * 기본값은 `docker-compose.dev.yml` 의 로컬 postgres (개발용 기본 계정) 안의 별도 DB
 * `seedbook_test`. 다른 곳을 쓰려면 `TEST_DATABASE_URL` 로 덮어쓴다.
 * 테스트가 사용자 행을 만들고 지우므로, DB 이름이 `_test` 로 끝나지 않으면 거부한다
 * (개발/운영 DB 에 실수로 붙지 않도록).
 */
const DEFAULT_TEST_DATABASE_URL = "postgresql://seedbook:seedbook@127.0.0.1:5432/seedbook_test";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run DB tests against "${dbName}" — name must end with _test`);
  }
  return url;
}
