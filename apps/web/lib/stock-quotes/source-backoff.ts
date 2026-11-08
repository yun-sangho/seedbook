/**
 * 외부 시세 소스 호출을 실패 후 잠시 멈추는 지수 백오프.
 *
 * 소스가 실패하면 캐시가 갱신되지 않아, 그대로 두면 들어오는 요청마다 소스를 다시
 * 두드리게 된다 (차단 중이면 더 악화되고, 사용자 응답도 매번 타임아웃만큼 느려진다).
 * 실패할 때마다 쉬는 시간을 base → 2배 … → max 로 늘리고, 성공하면 초기화한다.
 */
export interface SourceBackoff {
  canCall(now: number): boolean;
  recordFailure(now: number): void;
  recordSuccess(): void;
}

export function createSourceBackoff({
  baseMs,
  maxMs,
}: {
  baseMs: number;
  maxMs: number;
}): SourceBackoff {
  let consecutiveFailures = 0;
  let pausedUntil = 0;

  return {
    canCall: (now) => now >= pausedUntil,
    recordFailure: (now) => {
      consecutiveFailures++;
      const pauseMs = Math.min(baseMs * 2 ** (consecutiveFailures - 1), maxMs);
      pausedUntil = now + pauseMs;
    },
    recordSuccess: () => {
      consecutiveFailures = 0;
      pausedUntil = 0;
    },
  };
}
