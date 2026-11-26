import { resetDbPool } from "@seedbook/database";

/** 웹 요청 안에서 DB 를 기다리는 최대 시간. 정상 쿼리는 수십 ms 다. */
export const DB_TIMEOUT_MS = 8000;

export class DbTimeoutError extends Error {
  constructor(ms: number) {
    super(`database did not answer within ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

/**
 * DB 를 쓰는 일을 `ms` 안에 끝내지 못하면 `DbTimeoutError` 로 포기한다. postgres.js 는 쿼리 시간
 * 제한이 없어, 커넥션 풀이 막히면 요청이 영원히 멈춘다 (T34). 포기할 때 `onTimeout` (기본: 풀을
 * 새로 만든다) 을 불러, 막힌 풀을 다음 요청이 다시 쓰지 않게 한다.
 */
export async function withDbTimeout<T>(
  work: () => Promise<T>,
  { ms = DB_TIMEOUT_MS, onTimeout = resetDbPool }: { ms?: number; onTimeout?: () => void } = {}
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new DbTimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
