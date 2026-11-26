/** 웹 요청 안에서 DB 를 기다리는 최대 시간. 정상 쿼리는 수십 ms 다. */
export const DB_TIMEOUT_MS = 8000;

export class DbTimeoutError extends Error {
  constructor(ms: number) {
    super(`database did not answer within ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

/**
 * DB 를 쓰는 일을 `ms` 안에 끝내지 못하면 `DbTimeoutError` 로 포기한다. 요청이 DB 를 영원히 기다리지
 * 않게 하는 마지막 안전망이다 (T34). 답하지 않는 쿼리 자체는 커넥션 풀의 `query_timeout` 이 취소하고
 * 그 연결만 다시 연다 (`postgresPoolOptions`). 여기서 풀을 통째로 버리지 않는다 — 그러면 다른 요청의
 * 멀쩡한 쿼리까지 끊긴다 (T35).
 */
export async function withDbTimeout<T>(
  work: () => Promise<T>,
  { ms = DB_TIMEOUT_MS }: { ms?: number } = {}
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
