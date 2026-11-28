// @vitest-environment node
import {
  ACCOUNT_SORT_OPTIONS,
  account,
  accountRecord,
  allocation,
  cash,
  DRIFT_MODES,
  type FieldSpec,
  HOLDINGS_SORT_OPTIONS,
  holding,
  INVESTMENT_TREND_RANGES,
  MAX_PLANT_STAGE,
  MAX_RESULT_HOLDINGS,
  PORTFOLIO_STOCK_SORT_OPTIONS,
  parseValue,
  portfolio,
  REBALANCING_TASK_ACTIONS,
  REBALANCING_TASK_SECTIONS,
  REBALANCING_TASK_SORTS,
  type RecordDefinition,
  type RecordType,
  type RecordValues,
  rebalancing,
  rebalancingTask,
  SAMPLE_UUID,
  sampleRecord,
  settings,
} from "@seedbook/domain";
import { parseInvestmentFields } from "@seedbook/domain/v1/investment-record";
import { parsePortfolioFields } from "@seedbook/domain/v1/portfolio-record";
import {
  MAX_REBALANCING_TASKS,
  parseRebalancingFields,
} from "@seedbook/domain/v1/rebalancing-record";
import { investmentsSyncConfig } from "@web/features/investments/sync/investments-sync-config";
import { HOLDINGS_SORT_OPTION_VALUES } from "@web/features/investments/types/holdings-sort";
import type {
  CashItem,
  InvestmentItem,
  InvestmentRecord,
  StockHolding,
} from "@web/features/investments/types/types";
import { ACCOUNT_SORT_OPTION_VALUES } from "@web/features/investments/utils/sort-accounts";
import { portfolioSyncConfig } from "@web/features/portfolio/sync/portfolio-sync-config";
import {
  DEFAULT_DRIFT_THRESHOLD_PERCENT,
  LEGACY_DRIFT_MODE,
  MAX_PLANT_STAGE as WEB_MAX_PLANT_STAGE,
} from "@web/features/portfolio/types/constants";
import type { PortfolioAllocation, PortfolioItem } from "@web/features/portfolio/types/types";
import { PORTFOLIO_STOCK_SORT_OPTION_VALUES } from "@web/features/portfolio/utils/sort-portfolio-stock-rows";
import { rebalancingSyncConfig } from "@web/features/rebalancing/sync/rebalancing-sync-config";
import type { RebalancingSession, RebalancingTask } from "@web/features/rebalancing/types/types";
import { parseCollapsedSections } from "@web/features/rebalancing/utils/collapsed-sections";
import { isRebalancingTaskSort } from "@web/features/rebalancing/utils/sort-rebalancing-tasks";
import {
  type AccountPreferences,
  DEFAULT_ACCOUNT_PREFERENCES,
  invalidPreferenceKeys,
  parseAccountPreferences,
} from "@web/features/settings/utils/account-preferences";
import type { ManagedStoreConfig } from "@web/lib/sync/managed-store-config";
import { TimeRange } from "@web/types/time.consts";
import { describe, expect, expectTypeOf, it } from "vitest";
import { PLANNED_CLIENT_FIELDS } from "./exceptions";

/**
 * 레코드 정의 ↔ 지금 클라이언트 코드 (store 타입, 동기화 설정의 normalize·toData·fromData) 와
 * 서버 검증 (`@seedbook/domain/v1/<domain>-record.ts`, envelope 번역기도 같은 함수를 쓴다). 필드 이름·타입이
 * 어긋나면 실패한다. 아직 없는 필드는 `PLANNED_CLIENT_FIELDS`.
 */

type Fields = Record<string, unknown>;

function withoutPlanned(type: RecordType, values: Fields): Fields {
  const planned = PLANNED_CLIENT_FIELDS[type] ?? {};
  return Object.fromEntries(Object.entries(values).filter(([name]) => !(name in planned)));
}

const pick = (value: unknown, names: string[]): Fields =>
  Object.fromEntries(names.map((name) => [name, (value as Fields)[name]]));

const clientFieldNames = (definition: RecordDefinition) =>
  Object.keys(withoutPlanned(definition.type as RecordType, definition.fields));

const sample = (definition: RecordDefinition) =>
  withoutPlanned(definition.type as RecordType, sampleRecord(definition));

const ALLOCATION_ID = "a1f0c3d2-6b7e-4f81-9c2d-3e4f5a6b7c8d";

// ─── 타입 ───────────────────────────────────────────────────────────────────

describe("client types", () => {
  it("investments match account, holding, cash and accountRecord", () => {
    type Account = Omit<RecordValues<typeof account>, "portfolioId">;
    type ClientAccount = Omit<
      InvestmentItem,
      "id" | "records" | "holdings" | "cashItems" | "sellCostPercent"
    >;
    expectTypeOf<ClientAccount>().toEqualTypeOf<Account>();
    expectTypeOf<Omit<StockHolding, "id">>().toEqualTypeOf<RecordValues<typeof holding>>();
    expectTypeOf<Omit<CashItem, "id">>().toEqualTypeOf<RecordValues<typeof cash>>();
    expectTypeOf<InvestmentRecord>().toEqualTypeOf<RecordValues<typeof accountRecord>>();
  });

  it("portfolios match portfolio and allocation", () => {
    type ClientPortfolio = Omit<
      PortfolioItem,
      "id" | "allocations" | "accountIds" | "createdAt" | "updatedAt"
    >;
    type Portfolio = RecordValues<typeof portfolio>;
    expectTypeOf<keyof ClientPortfolio>().toEqualTypeOf<keyof Portfolio>();
    // growthStage 는 클라이언트가 0~4 리터럴로 좁힌다 — 클라이언트 값은 정의를 통과한다.
    expectTypeOf<ClientPortfolio>().toExtend<Portfolio>();
    expectTypeOf<Omit<PortfolioAllocation, "id">>().toEqualTypeOf<
      RecordValues<typeof allocation>
    >();
  });

  it("rebalancing sessions match rebalancing and rebalancingTask", () => {
    type ClientSession = Required<Omit<RebalancingSession, "id" | "tasks">>;
    type Session = RecordValues<typeof rebalancing>;
    expectTypeOf<keyof ClientSession>().toEqualTypeOf<keyof Session>();
    // 결과의 cashBefore 는 클라이언트에서 선택 필드 — 정의 값은 클라이언트 타입에 들어간다.
    expectTypeOf<Session>().toExtend<ClientSession>();

    type ClientTask = Required<Omit<RebalancingTask, "id">>;
    type Task = Omit<RecordValues<typeof rebalancingTask>, "allocationId">;
    expectTypeOf<ClientTask>().toEqualTypeOf<Task>();
  });

  it("account preferences match settings", () => {
    type ClientSettings = Required<AccountPreferences>;
    type Settings = RecordValues<typeof settings>;
    expectTypeOf<keyof ClientSettings>().toEqualTypeOf<keyof Settings>();
    expectTypeOf<ClientSettings>().toExtend<Settings>();
  });
});

// ─── 값 목록·기본값 ─────────────────────────────────────────────────────────

const defaultOf = (definition: RecordDefinition, field: string) =>
  definition.fields[field]?.spec.default?.value;

describe("client constants", () => {
  it("settings enums and defaults match the account preferences", () => {
    expect([...HOLDINGS_SORT_OPTIONS]).toEqual([...HOLDINGS_SORT_OPTION_VALUES]);
    expect([...ACCOUNT_SORT_OPTIONS]).toEqual([...ACCOUNT_SORT_OPTION_VALUES]);
    expect([...PORTFOLIO_STOCK_SORT_OPTIONS]).toEqual([...PORTFOLIO_STOCK_SORT_OPTION_VALUES]);
    expect([...INVESTMENT_TREND_RANGES].sort()).toEqual(Object.values(TimeRange).sort());
    expect(REBALANCING_TASK_SORTS.every(isRebalancingTaskSort)).toBe(true);
    expect(parseCollapsedSections([...REBALANCING_TASK_SECTIONS])).toEqual([
      ...REBALANCING_TASK_SECTIONS,
    ]);
    const defaults = Object.fromEntries(
      Object.keys(settings.fields).map((name) => [name, defaultOf(settings, name)])
    );
    expect(defaults).toEqual(DEFAULT_ACCOUNT_PREFERENCES);
  });

  it("rejects values the client does not know", () => {
    expect(isRebalancingTaskSort("unknown")).toBe(false);
    expect(parseCollapsedSections(["unknown"])).toEqual([]);
  });

  it("portfolio limits and defaults match", () => {
    expect([...DRIFT_MODES].sort()).toEqual(["absolute", "relative"]);
    expect(defaultOf(portfolio, "driftMode")).toBe(LEGACY_DRIFT_MODE);
    expect(defaultOf(portfolio, "driftThresholdPercent")).toBe(DEFAULT_DRIFT_THRESHOLD_PERCENT);
    expect(MAX_PLANT_STAGE).toBe(WEB_MAX_PLANT_STAGE);
  });

  it("rebalancing limits match", () => {
    expect([...REBALANCING_TASK_ACTIONS]).toEqual(["매수", "매도"]);
    expect(MAX_RESULT_HOLDINGS).toBe(MAX_REBALANCING_TASKS);
  });
});

// ─── 동기화 설정 (normalize · toData · fromData) ────────────────────────────

interface ClientAdapter {
  definition: RecordDefinition;
  config: ManagedStoreConfig<{ id: string }>;
  /** 이 레코드의 필드를 `fields` 로 채운 store 항목. */
  item(fields: Fields): { id: string };
  /** store 항목 또는 전송 형식에서 이 레코드의 필드. */
  read(value: unknown): Fields;
}

const accountItem = (overrides: Partial<InvestmentItem>) => ({
  id: SAMPLE_UUID,
  ...(sample(account) as Omit<InvestmentItem, "id" | "records" | "holdings" | "cashItems">),
  sellCostPercent: 0,
  records: [],
  holdings: [],
  cashItems: [],
  ...overrides,
});

const portfolioItem = (overrides: Partial<PortfolioItem>) => ({
  id: SAMPLE_UUID,
  ...(sample(portfolio) as Omit<PortfolioItem, "id" | "allocations" | "accountIds">),
  accountIds: [],
  allocations: [],
  createdAt: "2026-11-28T00:00:00.000Z",
  updatedAt: "2026-11-28T00:00:00.000Z",
  ...overrides,
});

const sessionItem = (overrides: Partial<RebalancingSession>) => ({
  id: SAMPLE_UUID,
  ...(sample(rebalancing) as Omit<RebalancingSession, "id" | "tasks">),
  tasks: [],
  ...overrides,
});

const first = (list: unknown) => (list as unknown[])[0];
const asConfig = <T extends { id: string }>(config: ManagedStoreConfig<T>) =>
  config as unknown as ManagedStoreConfig<{ id: string }>;

const CLIENT_ADAPTERS: ClientAdapter[] = [
  {
    definition: account,
    config: asConfig(investmentsSyncConfig),
    item: (fields) => accountItem(fields),
    read: (value) => pick(value, clientFieldNames(account)),
  },
  {
    definition: holding,
    config: asConfig(investmentsSyncConfig),
    item: (fields) => accountItem({ holdings: [{ id: SAMPLE_UUID, ...fields } as StockHolding] }),
    read: (value) => pick(first((value as InvestmentItem).holdings), clientFieldNames(holding)),
  },
  {
    definition: cash,
    config: asConfig(investmentsSyncConfig),
    item: (fields) => accountItem({ cashItems: [{ id: SAMPLE_UUID, ...fields } as CashItem] }),
    read: (value) => pick(first((value as InvestmentItem).cashItems), clientFieldNames(cash)),
  },
  {
    definition: accountRecord,
    config: asConfig(investmentsSyncConfig),
    item: (fields) => accountItem({ records: [fields as unknown as InvestmentRecord] }),
    read: (value) =>
      pick(first((value as InvestmentItem).records), clientFieldNames(accountRecord)),
  },
  {
    definition: portfolio,
    config: asConfig(portfolioSyncConfig),
    item: (fields) => portfolioItem(fields),
    read: (value) => pick(value, clientFieldNames(portfolio)),
  },
  {
    definition: allocation,
    config: asConfig(portfolioSyncConfig),
    item: (fields) =>
      portfolioItem({ allocations: [{ id: SAMPLE_UUID, ...fields } as PortfolioAllocation] }),
    read: (value) =>
      pick(first((value as PortfolioItem).allocations), clientFieldNames(allocation)),
  },
  {
    definition: rebalancing,
    config: asConfig(rebalancingSyncConfig),
    item: (fields) => sessionItem(fields),
    read: (value) => pick(value, clientFieldNames(rebalancing)),
  },
  {
    definition: rebalancingTask,
    config: asConfig(rebalancingSyncConfig),
    item: (fields) => sessionItem({ tasks: [{ id: ALLOCATION_ID, ...fields } as RebalancingTask] }),
    read: (value) =>
      pick(first((value as RebalancingSession).tasks), clientFieldNames(rebalancingTask)),
  },
];

/** 숫자 정리 규칙이 있는 필드 — 클라이언트 normalize 와 같은 값을 내야 한다. */
const numericNormalized = (definition: RecordDefinition) =>
  Object.entries(definition.fields).filter(([, field]) =>
    field.spec.normalize?.some((rule) => rule === "finiteOrZero" || rule === "finiteOrNull")
  );

describe.each(CLIENT_ADAPTERS.map((a) => [a.definition.type, a] as const))(
  "%s ↔ sync config",
  (_, adapter) => {
    const values = sample(adapter.definition);

    it("sends every defined field unchanged (toData)", () => {
      const data = adapter.config.toData(adapter.item(values));

      expect(adapter.read(data)).toEqual(values);
    });

    it("reads every defined field back (fromData)", () => {
      const data = adapter.config.toData(adapter.item(values));

      expect(adapter.read(adapter.config.fromData(SAMPLE_UUID, data))).toEqual(values);
    });

    const cases = numericNormalized(adapter.definition).flatMap(([name, field]) =>
      [Number.NaN, Number.POSITIVE_INFINITY].map((bad) => [name, bad, field.spec] as const)
    );
    if (cases.length === 0) return;
    it.each(cases)("normalizes %s = %s like the definition", (name, bad, spec) => {
      const normalized = adapter.config.normalizeItem(adapter.item({ ...values, [name]: bad }));
      const expected = parseValue(spec as FieldSpec, bad);

      expect(expected.ok).toBe(true);
      expect(adapter.read(normalized)[name]).toEqual(expected.ok ? expected.value : undefined);
    });
  }
);

// ─── 서버 검증 (엔티티 동기화·envelope 번역기 공용) ──────────────────────────

interface ServerAdapter {
  definition: RecordDefinition;
  /** 이 레코드의 필드를 `fields` 로 채운 v1 전송 값. */
  payload(fields: Fields): Fields;
  /** 서버 검증. 거부면 null. */
  parse(payload: Fields): unknown;
  read(parsed: unknown): Fields;
}

/** 하위 레코드를 담을 부모 전송 값 (부모 필드는 표본). */
const investmentPayload = (overrides: Fields) => ({
  ...sample(account),
  records: [],
  holdings: [],
  cashItems: [],
  ...overrides,
});
const portfolioPayload = (overrides: Fields) => ({
  ...sample(portfolio),
  accountIds: [],
  allocations: [],
  ...overrides,
});
const rebalancingPayload = (overrides: Fields) => ({
  ...sample(rebalancing),
  tasks: [],
  ...overrides,
});

const readPortfolio = (parsed: unknown) => {
  const { plant, ...rest } = parsed as Fields & { plant?: Fields };
  return pick({ ...rest, ...plant }, clientFieldNames(portfolio));
};

const parseSettings = (payload: Fields) =>
  invalidPreferenceKeys(payload).length > 0 ? null : parseAccountPreferences(payload);

const SERVER_ADAPTERS: ServerAdapter[] = [
  {
    definition: account,
    payload: (fields) => ({ records: [], holdings: [], cashItems: [], ...fields }),
    parse: parseInvestmentFields,
    read: (parsed) => pick(parsed, clientFieldNames(account)),
  },
  {
    definition: holding,
    payload: (fields) => investmentPayload({ holdings: [{ id: SAMPLE_UUID, ...fields }] }),
    parse: parseInvestmentFields,
    read: (parsed) => pick(first((parsed as Fields).holdings), clientFieldNames(holding)),
  },
  {
    definition: cash,
    payload: (fields) => investmentPayload({ cashItems: [{ id: SAMPLE_UUID, ...fields }] }),
    parse: parseInvestmentFields,
    read: (parsed) => pick(first((parsed as Fields).cashItems), clientFieldNames(cash)),
  },
  {
    definition: accountRecord,
    payload: (fields) => investmentPayload({ records: [fields] }),
    parse: parseInvestmentFields,
    read: (parsed) => pick(first((parsed as Fields).records), clientFieldNames(accountRecord)),
  },
  {
    definition: portfolio,
    payload: (fields) => ({ accountIds: [], allocations: [], ...fields }),
    parse: parsePortfolioFields,
    read: readPortfolio,
  },
  {
    definition: allocation,
    payload: (fields) => portfolioPayload({ allocations: [{ id: SAMPLE_UUID, ...fields }] }),
    parse: parsePortfolioFields,
    read: (parsed) => pick(first((parsed as Fields).allocations), clientFieldNames(allocation)),
  },
  {
    definition: rebalancing,
    payload: (fields) => ({ tasks: [], ...fields }),
    parse: parseRebalancingFields,
    read: (parsed) => pick(parsed, clientFieldNames(rebalancing)),
  },
  {
    definition: rebalancingTask,
    payload: (fields) => rebalancingPayload({ tasks: [{ id: ALLOCATION_ID, ...fields }] }),
    parse: parseRebalancingFields,
    read: (parsed) => pick(first((parsed as Fields).tasks), clientFieldNames(rebalancingTask)),
  },
  {
    definition: settings,
    payload: (fields) => fields,
    parse: parseSettings,
    read: (parsed) => pick(parsed, clientFieldNames(settings)),
  },
];

/**
 * v1 서버 검증과 정의가 의도적으로 다른 곳 (레코드.필드 → 이유). v2 서버(v2-3)가 정의로 바뀌면 지운다.
 */
const KNOWN_DIFFERENCES: Record<string, string> = {
  "portfolio.driftThresholdPercent":
    "v1 서버는 필수로 받는다. 정의는 컬럼 기본값 5 를 생성 기본값으로 쓴다 (기본값 있는 필드 = 확장 가능)",
};

/** 종류마다 정의가 받지 않는 값. */
const WRONG_KIND: Record<FieldSpec["kind"], unknown> = {
  text: 123,
  enum: "__unknown__",
  int: 1.5,
  decimal: "x",
  money: "x",
  date: "not-a-date",
  timestamp: "not-a-time",
  uuidRef: "not-a-uuid",
  bool: "yes",
  json: "not-json",
};

describe.each(SERVER_ADAPTERS.map((a) => [a.definition.type, a] as const))(
  "%s ↔ server validation",
  (type, adapter) => {
    const values = sample(adapter.definition);
    const fields = Object.entries(adapter.definition.fields).filter(
      ([name]) => !(name in (PLANNED_CLIENT_FIELDS[type as RecordType] ?? {}))
    );

    it("accepts a valid record and keeps every field", () => {
      const parsed = adapter.parse(adapter.payload(values));

      expect(parsed).not.toBeNull();
      expect(adapter.read(parsed)).toEqual(values);
    });

    it.each(fields.filter(([name]) => !KNOWN_DIFFERENCES[`${type}.${name}`]))(
      "treats a missing %s like the definition (default ↔ optional)",
      (name, field) => {
        const { [name]: _, ...rest } = values;

        const accepted = adapter.parse(adapter.payload(rest)) !== null;

        expect(accepted).toBe(field.spec.default !== undefined);
      }
    );

    // 정리 규칙으로 고쳐 받는 필드 (finiteOrZero 등) 는 v1 서버가 거부하므로 뺀다.
    const strictFields = fields.filter(([, field]) => !field.spec.normalize?.length);
    if (strictFields.length === 0) return;
    it.each(strictFields)("rejects a %s of the wrong kind like the definition", (name, field) => {
      const bad = field.spec.list ? "not-a-list" : WRONG_KIND[field.spec.kind];

      expect(parseValue(field.spec, bad).ok).toBe(false);
      expect(adapter.parse(adapter.payload({ ...values, [name]: bad }))).toBeNull();
    });

    const nullable = fields.filter(([, field]) => field.spec.nullable);
    if (nullable.length === 0) return;
    it.each(nullable)("accepts null for %s like the definition", (name) => {
      expect(adapter.parse(adapter.payload({ ...values, [name]: null }))).not.toBeNull();
    });
  }
);
