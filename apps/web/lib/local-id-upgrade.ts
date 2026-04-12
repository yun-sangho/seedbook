/**
 * 로컬스토리지의 number 기반 ID 를 UUID 문자열로 일괄 업그레이드.
 *
 * 왜 각 store 의 `migrate` 콜백이 아니라 이 bootstrap 에서 하나?
 * 자산 계획(asset-plan) 의 `accountPlans` 가 투자/저축 계좌 ID 를 **cross-store
 * 참조**하기 때문이다. 각 store 의 `migrate` 는 자기 영역만 볼 수 있어서
 * 같은 번호 → UUID 매핑을 공유할 수 없다. 그래서 여기서 한번에:
 *
 *   1. 6 개 envelope 를 read 한다
 *   2. investment/savings 계좌에 대한 oldNumber → newUuid 맵을 만든다
 *   3. 각 envelope 를 새 shape 으로 rewrite (계좌 ID, 보유 주식 ID, 현금 항목 ID)
 *   4. 자산 계획의 `accountPlans` 키를 맵으로 교체하고 `accountKind` 를 주입
 *   5. 레거시 `lastXxxId` 필드를 제거
 *   6. 완료 플래그를 기록
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

function upgradeInvestmentEnvelope(
  envelope: UnknownRecord,
  accountIdMap: Map<string, string>
): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const investments = asArray<UnknownRecord>(state.investments);
  if (investments.length === 0 && !("lastInvestmentId" in state)) return false;

  state.investments = investments.map((inv) => {
    const oldId = inv.id;
    const newId = ensureUuid(oldId);
    // 원래 ID 가 number 였든 string 이었든 map 에 기록해 둔다 (asset-plan 참조 해결용).
    if (oldId !== undefined && oldId !== null) {
      accountIdMap.set(String(oldId), newId);
    }
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

function upgradeSavingsEnvelope(
  envelope: UnknownRecord,
  accountIdMap: Map<string, string>
): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const savings = asArray<UnknownRecord>(state.savings);
  if (savings.length === 0 && !("lastSavingsId" in state)) return false;

  state.savings = savings.map((s) => {
    const oldId = s.id;
    const newId = ensureUuid(oldId);
    if (oldId !== undefined && oldId !== null) {
      accountIdMap.set(String(oldId), newId);
    }
    return { ...s, id: newId };
  });
  delete state.lastSavingsId;
  envelope.state = state;
  envelope.version = 2;
  return true;
}

function upgradeDebtsEnvelope(envelope: UnknownRecord): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const debts = asArray<UnknownRecord>(state.debts);
  if (debts.length === 0 && !("lastDebtId" in state)) return false;

  state.debts = debts.map((d) => ({ ...d, id: ensureUuid(d.id) }));
  delete state.lastDebtId;
  envelope.state = state;
  envelope.version = 2;
  return true;
}

function upgradeRealAssetsEnvelope(envelope: UnknownRecord): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const realAssets = asArray<UnknownRecord>(state.realAssets);
  if (realAssets.length === 0 && !("lastRealAssetId" in state)) return false;

  state.realAssets = realAssets.map((a) => ({ ...a, id: ensureUuid(a.id) }));
  delete state.lastRealAssetId;
  envelope.state = state;
  envelope.version = 2;
  return true;
}

function upgradeAssetPlanEnvelope(
  envelope: UnknownRecord,
  investmentIdMap: Map<string, string>,
  savingsIdMap: Map<string, string>
): boolean {
  const state = asObject(envelope.state);
  if (!state) return false;
  const plans = asArray<UnknownRecord>(state.plans);
  if (plans.length === 0) return false;

  state.plans = plans.map((plan) => {
    const accountPlans = asObject(plan.accountPlans);
    if (!accountPlans) return plan;

    const upgraded: UnknownRecord = {};
    for (const [rawKey, rawValue] of Object.entries(accountPlans)) {
      const valueObj = asObject(rawValue);
      if (!valueObj) continue;

      // Determine new key + discriminator.
      const investmentMatch = investmentIdMap.get(rawKey);
      const savingsMatch = savingsIdMap.get(rawKey);

      let newKey: string;
      let accountKind: "investment" | "savings";

      if (investmentMatch) {
        newKey = investmentMatch;
        accountKind = "investment";
      } else if (savingsMatch) {
        newKey = savingsMatch;
        accountKind = "savings";
      } else {
        // 매칭 실패 — 해당 계좌가 삭제된 뒤 남은 stale 참조. 기본적으로
        // investment 로 추정하되 key 는 그대로 두어 envelope 는 유효하게 유지.
        newKey = rawKey;
        accountKind = typeof valueObj.accountKind === "string"
          ? (valueObj.accountKind as "investment" | "savings")
          : "investment";
      }

      upgraded[newKey] = { ...valueObj, accountKind };
    }
    return { ...plan, accountPlans: upgraded };
  });
  envelope.state = state;
  envelope.version = 2;
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
    const savingsEnv = readEnvelope("savings-storage");
    const debtsEnv = readEnvelope("debts-storage");
    const realAssetsEnv = readEnvelope("real-assets-storage");
    const assetPlanEnv = readEnvelope("asset-plan-storage");

    const investmentIdMap = new Map<string, string>();
    const savingsIdMap = new Map<string, string>();

    const changed = {
      investment: investmentEnv
        ? upgradeInvestmentEnvelope(investmentEnv, investmentIdMap)
        : false,
      savings: savingsEnv ? upgradeSavingsEnvelope(savingsEnv, savingsIdMap) : false,
      debts: debtsEnv ? upgradeDebtsEnvelope(debtsEnv) : false,
      realAssets: realAssetsEnv ? upgradeRealAssetsEnvelope(realAssetsEnv) : false,
      assetPlan: assetPlanEnv
        ? upgradeAssetPlanEnvelope(assetPlanEnv, investmentIdMap, savingsIdMap)
        : false,
    };

    if (changed.investment && investmentEnv) writeEnvelope("investment-storage", investmentEnv);
    if (changed.savings && savingsEnv) writeEnvelope("savings-storage", savingsEnv);
    if (changed.debts && debtsEnv) writeEnvelope("debts-storage", debtsEnv);
    if (changed.realAssets && realAssetsEnv) writeEnvelope("real-assets-storage", realAssetsEnv);
    if (changed.assetPlan && assetPlanEnv) writeEnvelope("asset-plan-storage", assetPlanEnv);

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
