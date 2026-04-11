/**
 * HTTP 유틸 — 타임아웃 + 지수 백오프 재시도
 *
 * 외부 API (네이버/KRX) 호출 시 transient 실패로 전체 크롤링이 중단되는 것을
 * 방지한다.
 *
 * - AbortController 로 timeoutMs 내 응답이 없으면 abort
 * - 네트워크 에러 / 타임아웃 / HTTP 5xx / 429 는 backoff 후 재시도
 * - 그 외 4xx 는 재시도하지 않고 즉시 실패 (의미론적 에러)
 */

import { logger } from "../logger.js";

export interface RetryOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  /** 로그 prefix (요청을 식별할 짧은 문자열) */
  label?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const label = options.label ?? url;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response | undefined;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError / 네트워크 에러 등 — 재시도 대상
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (response) {
      if (response.ok) {
        return response;
      }

      if (!isRetriableStatus(response.status)) {
        // 400/401/403/404 등은 재시도해도 달라지지 않는다 — 즉시 실패.
        throw new Error(
          `${label} failed (non-retriable): ${response.status} ${response.statusText}`
        );
      }

      lastError = new Error(`${label} failed: ${response.status} ${response.statusText}`);
    }

    if (attempt < retries) {
      const wait = backoffMs * 2 ** attempt;
      logger.warn(`${label} 실패, ${wait}ms 후 재시도 (${attempt + 1}/${retries})`, {
        error: String(lastError),
      });
      await sleep(wait);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${retries} retries`);
}
