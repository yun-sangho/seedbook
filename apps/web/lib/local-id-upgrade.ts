/**
 * 로컬스토리지의 number 기반 ID 를 UUID 문자열로 일괄 업그레이드 (투자 store).
 *
 * 투자 계좌 / 보유 주식 / 현금 항목의 레거시 number ID 를 UUID 로 바꾸고 레거시
 * `lastXxxId` 필드를 지운 뒤 완료 플래그를 기록한다.
 *
 * 모듈 import 시점에 **한 번만** 실행된다. hybrid-storage 가 이 모듈을 side-effect
 * import 하므로 모든 Zustand store 가 하이드레이션하기 전에 끝난다.
 */

const UPGRADE_FLAG = "seedbook.localIdUpgraded.v1";

type UnknownRecord = Record<string, unknown>;

function safeParse(raw: string | null): UnknownRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as UnknownRecord) : null;
  } catch {
    return null;
  }
}

function readEnvelope(key: string): UnknownRecord | null {
  try {
    return safeParse(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeEnvelope(key: string, envelope: UnknownRecord): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // quota / private mode — 조용히 무시.
  }
}

function ensureUuid(existing: unknown): string {
  if (typeof existing === "string" && existing.length > 0) return existing;
  return crypto.randomUUID();
}

function asObject(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function upgradeInvestmentEnvelope(envelope: UnknownRecord): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const investments = asArray<UnknownRecord>(state.investments);
  if (investments.length === 0 && !("lastInvestmentId" in state)) return false;

  state.investments = investments.map((inv) => {
    const newId = ensureUuid(inv.id);
    const holdings = asArray<UnknownRecord>(inv.holdings).map((h) => ({
      ...h,
      id: ensureUuid(h.id),
    }));
    const cashItems = asArray<UnknownRecord>(inv.cashItems).map((c) => ({
      ...c,
      id: ensureUuid(c.id),
    }));
    return { ...inv, id: newId, holdings, cashItems };
  });
  delete state.lastInvestmentId;
  envelope.state = state;
  envelope.version = 4;
  return true;
}

/**
 * bootstrap 실행부. side-effect 로 import 해 한 번만 돌아간다.
 */
export function upgradeLocalIdsIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(UPGRADE_FLAG)) return;

    const investmentEnv = readEnvelope("investment-storage");
    if (investmentEnv && upgradeInvestmentEnvelope(investmentEnv)) {
      writeEnvelope("investment-storage", investmentEnv);
    }

    window.localStorage.setItem(UPGRADE_FLAG, "1");
  } catch (err) {
    // 업그레이드 실패 — 플래그를 기록하지 않아 다음 로드에 재시도한다.
    // 사용자에게 보이는 에러는 없지만 콘솔엔 남긴다.
    console.warn("[seedbook] local ID upgrade failed", err);
  }
}

// 모듈 import 시 자동 실행. hybrid-storage 가 이 모듈을 import 하므로
// 모든 store 파일보다 먼저 import 순서상 이 IIFE 가 동작한다.
upgradeLocalIdsIfNeeded();
