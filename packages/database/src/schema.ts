/**
 * Drizzle schema. 모든 테이블은 seedbook 스키마에 위치한다.
 * Postgres 의 default 스키마(public)는 사용하지 않는다.
 *
 * Prisma `prisma/schema.prisma` 와 1:1 대응. 컬럼 타입/제약/인덱스/관계 모두 보존.
 */

import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const seedbook = pgSchema("seedbook");

/**
 * 엔티티 단위 동기화 (`/api/sync/*`) 대상 최상위 테이블이 갖는 컬럼.
 *
 * - `version`: 행이 바뀔 때마다 +1. 클라이언트는 마지막으로 본 version 을 `baseVersion`
 *   으로 보내고, 다르면 서버가 충돌로 돌려준다 (낙관적 동시성 제어).
 * - `deletedAt`: 삭제 톰스톤. 다른 기기가 pull 로 삭제를 알 수 있도록 행을 바로 지우지 않는다.
 */
function syncColumns() {
  return {
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deletedAt", { precision: 3, mode: "date" }),
  };
}

/**
 * 동기화 v2 레코드 (`packages/domain` 의 정의) 의 공통 열 중 v2-2 에서 더한 것.
 *
 * - `changeSeq`: 사용자별 변경 번호 (`user_sync_state.seq` 로 매긴다, 설계 §4.4). pull 커서다.
 *   0 은 아직 번호를 받지 않은 행 — v1 쓰기 경로는 이 열을 모르므로 기본값으로 남고,
 *   `db:backfill:sync-v2` 가 채운다.
 * - `sortKey`: 목록 순서 (분수 인덱스). null 이면 아직 키가 없는 행 (backfill 이 채움).
 */
function changeSeqColumn() {
  return bigint("changeSeq", { mode: "number" }).notNull().default(0);
}

function sortKeyColumn() {
  return text("sortKey");
}

/**
 * 하위 레코드 테이블의 공통 열 (설계 §2.2). 루트와 달리 `updatedAt` 은 DB `now()` 로 찍는다.
 * `userId` 는 v1 쓰기 경로가 채우지 않으므로 nullable 이다 (backfill 이 부모에서 채움).
 */
function childSyncColumns() {
  return {
    userId: text("userId").references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  };
}

// ─── Stock master ───────────────────────────────────────────────────────────

export const stock = seedbook.table(
  "Stock",
  {
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("KRW"),
    sector: text("sector"),
    // 종목 종류 — 네이버 stockEndType 그대로 ("stock" | "etf" | "etn" …). 호가 단위가 종류마다
    // 다르다. 크롤러가 아직 채우지 않은 종목이면 null.
    securityType: text("securityType"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.market, t.ticker], name: "Stock_pkey" }),
    index("Stock_market_idx").on(t.market),
    index("Stock_isActive_idx").on(t.isActive),
    index("Stock_name_idx").on(t.name),
  ]
);

export const stockPrice = seedbook.table(
  "StockPrice",
  {
    id: serial("id").primaryKey(),
    stockMarket: text("stockMarket").notNull(),
    stockTicker: text("stockTicker").notNull(),
    // KST 자정 기준 trading day. timestamptz(3).
    date: timestamp("date", { withTimezone: true, precision: 3, mode: "date" }).notNull(),
    open: bigint("open", { mode: "bigint" }).notNull(),
    high: bigint("high", { mode: "bigint" }).notNull(),
    low: bigint("low", { mode: "bigint" }).notNull(),
    close: bigint("close", { mode: "bigint" }).notNull(),
    volume: bigint("volume", { mode: "bigint" }).notNull(),
    marketCap: bigint("marketCap", { mode: "bigint" }),
    change: bigint("change", { mode: "bigint" }),
  },
  (t) => [
    uniqueIndex("StockPrice_stockMarket_stockTicker_date_key").on(
      t.stockMarket,
      t.stockTicker,
      t.date
    ),
    index("StockPrice_date_idx").on(t.date),
    index("StockPrice_stockMarket_stockTicker_idx").on(t.stockMarket, t.stockTicker),
  ]
);

/**
 * 장중 현재가 캐시 (종목당 1행). web 의 `/api/stocks/prices` 가 요청 시 네이버 실시간
 * 시세를 조회해 upsert 하고, 같은 종목을 다른 사용자가 짧은 시간 안에 다시 물으면
 * 이 행을 그대로 쓴다. 일봉 확정값은 여전히 `StockPrice` 가 소스 오브 트루스.
 */
export const stockQuote = seedbook.table(
  "StockQuote",
  {
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    /** 소스가 알려준 시장 상태 (예: OPEN, CLOSE). */
    marketStatus: text("marketStatus").notNull(),
    /** 소스가 알려준 마지막 체결 시각. */
    tradedAt: timestamp("tradedAt", { withTimezone: true, precision: 3, mode: "date" }).notNull(),
    /** 우리가 소스에서 가져온 시각. 캐시 만료 판단용. */
    fetchedAt: timestamp("fetchedAt", { withTimezone: true, precision: 3, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.market, t.ticker], name: "StockQuote_pkey" })]
);

// ─── Better Auth (Kakao login) ──────────────────────────────────────────────

export const user = seedbook.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull(),
});

export const session = seedbook.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { precision: 3, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
});

export const account = seedbook.table("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { precision: 3, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { precision: 3, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull(),
});

export const verification = seedbook.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { precision: 3, mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }),
});

/**
 * 생체 인증 로그인 기기 자격 증명 (네이티브 앱). 앱이 Keychain/Keystore 에 생체 인증으로 잠가 둔
 * 토큰의 해시만 둔다 — 토큰 원문은 서버에 남기지 않는다. 기능을 끄거나 오래 쓰지 않으면 행을
 * 지운다 (`apps/web/server/device-credentials/`).
 */
export const deviceCredential = seedbook.table(
  "device_credential",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("tokenHash").notNull(),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull(),
    lastUsedAt: timestamp("lastUsedAt", { precision: 3, mode: "date" }).notNull(),
  },
  (t) => [index("device_credential_userId_idx").on(t.userId)]
);

/**
 * 약관·개인정보 동의 기록. 문서의 버전마다 한 행이라 개정 뒤 다시 동의해도 이전 기록이 남는다.
 * 버전은 `legal_document` 의 (document, version). IP·기기 정보는 두지 않는다.
 */
export const userConsent = seedbook.table(
  "user_consent",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // "terms" | "privacy"
    document: text("document").notNull(),
    version: text("version").notNull(),
    agreedAt: timestamp("agreedAt", { precision: 3, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.document, t.version], name: "user_consent_pkey" })]
);

/**
 * 공개한 약관·개인정보처리방침 버전. 레포(`src/legal/`)에서 쓰고 `db:legal:publish` 가 넣는다.
 * 공개한 행은 고치지 않는다 — 바꾸려면 새 버전을 추가한다. 시행일(KST)이 지난 버전 중 가장 늦은 것이
 * 현재 버전이다.
 */
export const legalDocument = seedbook.table(
  "legal_document",
  {
    // "terms" | "privacy"
    document: text("document").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    // 작은 마크다운 (`src/legal/markdown.ts`). HTML 은 쓰지 않는다.
    body: text("body").notNull(),
    // 바뀐 내용 요약. 첫 버전은 null.
    summary: text("summary"),
    effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
    requiresConsent: boolean("requiresConsent").notNull(),
    publishedAt: timestamp("publishedAt", { precision: 3, mode: "date" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.document, t.version], name: "legal_document_pkey" }),
    uniqueIndex("legal_document_document_effectiveDate_key").on(t.document, t.effectiveDate),
  ]
);

// ─── Investments ────────────────────────────────────────────────────────────

export const investmentAccount = seedbook.table(
  "investment_account",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accountName: text("accountName").notNull(),
    accountType: text("accountType").notNull(),
    currency: text("currency").notNull(),
    initialInvestment: bigint("initialInvestment", { mode: "bigint" }).notNull(),
    currentValue: bigint("currentValue", { mode: "bigint" }).notNull(),
    note: text("note").notNull().default(""),
    color: text("color").notNull(),
    // 이 계좌가 연결된 포트폴리오 (연결의 원본). 한 계좌는 최대 하나의 포트폴리오에만 연결된다.
    portfolioId: uuid("portfolioId").references((): AnyPgColumn => portfolio.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    sortKey: sortKeyColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("investment_account_userId_idx").on(t.userId),
    index("investment_account_portfolioId_idx").on(t.portfolioId),
    index("investment_account_userId_updatedAt_idx").on(t.userId, t.updatedAt),
    index("investment_account_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

export const investmentRecord = seedbook.table(
  "investment_record",
  {
    // 동기화 v2 레코드 id = uuidv5(accountId, date) (`@seedbook/domain` 의 `deriveRecordId`).
    // v1 쓰기 경로가 채우지 않아 nullable — backfill 이 채운다. PK (accountId, date) 는 그대로.
    id: uuid("id"),
    accountId: uuid("accountId")
      .notNull()
      .references(() => investmentAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    initialInvestment: bigint("initialInvestment", { mode: "bigint" }).notNull(),
    currentValue: bigint("currentValue", { mode: "bigint" }).notNull(),
    ...childSyncColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.date], name: "investment_record_pkey" }),
    index("investment_record_accountId_date_idx").on(t.accountId, t.date),
    uniqueIndex("investment_record_id_key").on(t.id),
    index("investment_record_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

export const stockHolding = seedbook.table(
  "stock_holding",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("accountId")
      .notNull()
      .references(() => investmentAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    memo: text("memo").notNull().default(""),
    ...childSyncColumns(),
    sortKey: sortKeyColumn(),
  },
  (t) => [
    index("stock_holding_accountId_idx").on(t.accountId),
    index("stock_holding_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

export const cashItem = seedbook.table(
  "cash_item",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("accountId")
      .notNull()
      .references(() => investmentAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    label: text("label").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    ...childSyncColumns(),
    sortKey: sortKeyColumn(),
  },
  (t) => [
    index("cash_item_accountId_idx").on(t.accountId),
    index("cash_item_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

/**
 * 계좌별 하루 평가 기록. stock-crawler 가 평일 오후 시세 수집 뒤 cloud 모드 사용자의 서버 계좌로
 * 계산해 넣는다 (`src/account-snapshots.ts`, 같은 날 다시 돌면 덮어씀). 사용자 합계는 계좌를 더해
 * 구한다. `investment_record` 는 클라이언트 동기화가 저장마다 통째로 바꾸는 표라 쓰지 않는다.
 * 금액은 원.
 */
export const investmentAccountSnapshot = seedbook.table(
  "investment_account_snapshot",
  {
    accountId: uuid("accountId")
      .notNull()
      .references(() => investmentAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // 기록한 KST 날짜.
    date: date("date", { mode: "string" }).notNull(),
    // 보유 종목 × 그날(없으면 직전) 종가 합. 가격을 못 찾은 종목은 빠진다.
    stockValue: bigint("stockValue", { mode: "bigint" }).notNull(),
    // 현금 항목 합. 강제 매수 등으로 음수일 수 있다.
    cashValue: bigint("cashValue", { mode: "bigint" }).notNull(),
    totalValue: bigint("totalValue", { mode: "bigint" }).notNull(),
    // 종목코드가 있는 보유 종목 수와 그중 가격을 못 찾은 수.
    holdingCount: integer("holdingCount").notNull(),
    missingPriceCount: integer("missingPriceCount").notNull(),
    // 쓴 종가 중 가장 오래된 날짜. `date` 보다 이르면 일부 종목은 직전 종가로 계산했다. 종목이 없으면 null.
    oldestPriceDate: date("oldestPriceDate", { mode: "string" }),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.date], name: "investment_account_snapshot_pkey" }),
    index("investment_account_snapshot_userId_date_idx").on(t.userId, t.date),
  ]
);

// ─── Portfolios ─────────────────────────────────────────────────────────────

export const portfolio = seedbook.table(
  "portfolio",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    note: text("note").notNull().default(""),
    // 이격률 계산 방식: "relative" (목표 대비 비율) | "absolute" (%p 차이).
    // 기존 행은 방식이 생기기 전처럼 %p 차이로 판정하도록 "absolute" 가 기본값.
    driftMode: text("driftMode", { enum: ["relative", "absolute"] })
      .notNull()
      .default("absolute"),
    driftThresholdPercent: doublePrecision("driftThresholdPercent").notNull().default(5),
    // 포트폴리오 식물. 지금 목표 금액(원)을 달성하면 한 단계 자라고 목표는 비워진다 — 사용자가
    // 다음 목표를 새로 정한다. 목표가 없으면 식물은 그 단계에 머문다.
    goalAmount: bigint("goalAmount", { mode: "number" }),
    // 도달한 성장 단계 0(씨앗)~4(꽃·열매). 올라가기만 한다.
    growthStage: integer("growthStage").notNull().default(0),
    // 달성한 목표들 [{ amount, reachedAt }] (오래된 순). 마지막 항목이 처짐 판정 기준.
    goalHistory: jsonb("goalHistory")
      .$type<Array<{ amount: number; reachedAt: string }>>()
      .notNull()
      .default([]),
    // 수확 주기 번호 (1부터, 화면에 보이지 않음). 열매를 수확하면 +1 되고 빈 화분부터 다시 시작한다.
    season: integer("season").notNull().default(1),
    // 고른 식물 종류 ("tree" | "fern", 값이 늘 수 있다). null 이면 포트폴리오 id 해시로 정한다.
    plantKind: text("plantKind"),
    // 목표를 이루면 하고 싶은 일.
    wish: text("wish").notNull().default(""),
    // 씨앗을 심을 때 정한 식물 이름. 비어 있으면 포트폴리오 이름만 보인다.
    plantName: text("plantName").notNull().default(""),
    // 정한 소원들 [{ wish, at }] (오래된 순, 최근 20개). 마지막 항목이 지금 소원.
    wishHistory: jsonb("wishHistory")
      .$type<Array<{ wish: string; at: string | null }>>()
      .notNull()
      .default([]),
    // 이룬 열매 목표 { amount, reachedAt } (수확 주기의 다섯 번째 목표). 있으면 열매가 열려 바로 수확할 수 있다.
    fruitGoal: jsonb("fruitGoal").$type<{ amount: number; reachedAt: string }>(),
    // 최종 목표까지의 단계 목표 다섯 개 (원, 새싹·묘목·나무·꽃·열매). 비어 있으면 단계마다 목표를 정하던 식물.
    stageGoals: jsonb("stageGoals").$type<number[]>().notNull().default([]),
    // 단계 목표를 나눈 출발 금액 (원, 심을 때의 평가금액). 단계와 막대는 이 금액 뒤로 늘어난 만큼.
    stageBase: bigint("stageBase", { mode: "number" }),
    // 비중 이탈을 처음 본 시각 (KST 날짜 시작). 기준 안으로 돌아오면 null.
    driftSince: timestamp("driftSince", { precision: 3, mode: "date" }),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    sortKey: sortKeyColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("portfolio_userId_idx").on(t.userId),
    index("portfolio_userId_updatedAt_idx").on(t.userId, t.updatedAt),
    index("portfolio_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

export const portfolioAllocation = seedbook.table(
  "portfolio_allocation",
  {
    id: uuid("id").primaryKey(),
    portfolioId: uuid("portfolioId")
      .notNull()
      .references(() => portfolio.id, { onDelete: "cascade", onUpdate: "cascade" }),
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    targetPercent: doublePrecision("targetPercent").notNull(),
    ...childSyncColumns(),
    sortKey: sortKeyColumn(),
  },
  (t) => [
    index("portfolio_allocation_portfolioId_idx").on(t.portfolioId),
    index("portfolio_allocation_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

// ─── Plant harvests ─────────────────────────────────────────────────────────

/**
 * 수확 기록 (동기화 v2 `harvest` 레코드). 식물(지금은 포트폴리오, `sourceType`)이 열매 목표까지 이룬
 * 수확 주기 하나. 주인이 지워져도 남도록 FK 대신 id 와 이름을 함께 보관한다.
 * id = uuidv5(sourceId, `season:<season>`) (클라이언트가 만든다).
 */
export const plantHarvest = seedbook.table(
  "plant_harvest",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // 식물의 주인 종류 ("portfolio", 값이 늘 수 있다).
    sourceType: text("sourceType").notNull().default("portfolio"),
    sourceId: text("sourceId").notNull(),
    sourceName: text("sourceName").notNull(),
    season: integer("season").notNull(),
    plantKind: text("plantKind").notNull(),
    wish: text("wish").notNull().default(""),
    // 수확한 식물의 이름과 소원 이력 [{ wish, at }] (오래된 순, 최근 20개).
    plantName: text("plantName").notNull().default(""),
    wishHistory: jsonb("wishHistory")
      .$type<Array<{ wish: string; at: string | null }>>()
      .notNull()
      .default([]),
    // 이룬 목표들 [{ amount, reachedAt }] (오래된 순, 최대 5개).
    goals: jsonb("goals").$type<Array<{ amount: number; reachedAt: string }>>().notNull(),
    harvestedAt: timestamp("harvestedAt", { precision: 3, mode: "date" }).notNull(),
    // 소원을 "했어요" 로 표시한 시각.
    doneAt: timestamp("doneAt", { precision: 3, mode: "date" }),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    sortKey: sortKeyColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("plant_harvest_userId_idx").on(t.userId),
    index("plant_harvest_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

// ─── Rebalancing ────────────────────────────────────────────────────────────

/**
 * 계좌 하나에 대해 시작한 리밸런싱. 시작 시점의 권장 매매를 할 일(`rebalancing_task`)로 스냅샷해
 * 두고, 모두 끝내면 `completedAt` 이 찍혀 기록으로 남는다. 계좌/포트폴리오가 지워져도
 * 기록은 남도록 FK 대신 id 와 이름을 함께 보관한다.
 */
export const rebalancing = seedbook.table(
  "rebalancing",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accountId: text("accountId").notNull(),
    accountName: text("accountName").notNull(),
    portfolioId: text("portfolioId").notNull(),
    portfolioName: text("portfolioName").notNull(),
    cashDelta: bigint("cashDelta", { mode: "bigint" }).notNull(),
    startedAt: timestamp("startedAt", { precision: 3, mode: "date" }).notNull(),
    completedAt: timestamp("completedAt", { precision: 3, mode: "date" }),
    // 완료하며 계좌에 반영한 뒤의 포트폴리오 구성 스냅샷. 반영하지 않았으면 null.
    result: jsonb("result"),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    sortKey: sortKeyColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("rebalancing_userId_idx").on(t.userId),
    index("rebalancing_userId_updatedAt_idx").on(t.userId, t.updatedAt),
    index("rebalancing_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

/**
 * 리밸런싱 할 일 (동기화 v2 `rebalancingTask` 레코드). v2-2 에서 옛 `rebalancing.tasks` jsonb 를
 * 펼쳐 만들었다 (jsonb 컬럼은 v2-5b 에서 지웠다).
 * id = uuidv5(rebalancingId, allocationId). `allocationId` 는 옛 `task.id` (포트폴리오 배분 id).
 */
export const rebalancingTask = seedbook.table(
  "rebalancing_task",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    rebalancingId: uuid("rebalancingId")
      .notNull()
      .references(() => rebalancing.id, { onDelete: "cascade", onUpdate: "cascade" }),
    allocationId: text("allocationId").notNull(),
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    action: text("action", { enum: ["매수", "매도"] }).notNull(),
    amount: doublePrecision("amount").notNull(),
    price: doublePrecision("price"),
    quantity: doublePrecision("quantity"),
    priceAsOf: timestamp("priceAsOf", { precision: 3, mode: "date" }),
    priceKind: text("priceKind", { enum: ["realtime", "close"] }),
    executedQuantity: doublePrecision("executedQuantity"),
    executedPrice: doublePrecision("executedPrice"),
    orderedQuantity: doublePrecision("orderedQuantity"),
    orderedPrice: doublePrecision("orderedPrice"),
    filledQuantity: doublePrecision("filledQuantity"),
    filledAmount: doublePrecision("filledAmount"),
    done: boolean("done").notNull(),
    ...syncColumns(),
    changeSeq: changeSeqColumn(),
    sortKey: sortKeyColumn(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [
    index("rebalancing_task_rebalancingId_idx").on(t.rebalancingId),
    index("rebalancing_task_userId_changeSeq_idx").on(t.userId, t.changeSeq),
  ]
);

/**
 * 사용자별 동기화 변경 번호 (설계 §4.4). 쓰기 트랜잭션이 이 행을 올려(`reserveChangeSeqs`)
 * 받은 번호를 바꾼 레코드의 `changeSeq` 에 넣는다 — 행 잠금이 사용자별 직렬화를 겸한다.
 */
export const userSyncState = seedbook.table("user_sync_state", {
  userId: text("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  seq: bigint("seq", { mode: "number" }).notNull().default(0),
});

// ─── User preferences ───────────────────────────────────────────────────────

export const userPreference = seedbook.table("user_preference", {
  userId: text("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  holdingsSortOption: text("holdingsSortOption").notNull().default("evalDesc"),
  // 진행 중 리밸런싱의 매매 정렬 ("nameDesc" | "nameAsc" | "evalDesc" | "evalAsc").
  rebalancingTaskSort: text("rebalancingTaskSort").notNull().default("nameDesc"),
  // 진행 중 리밸런싱에서 접어 둔 매매 섹션 ("pending" | "ordered" | "filled"). 기본은 모두 펼침.
  rebalancingCollapsedSections: text("rebalancingCollapsedSections")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // 계좌 목록 정렬 ("evalDesc" | "evalAsc").
  accountSortOption: text("accountSortOption").notNull().default("evalDesc"),
  // 포트폴리오 현황 "종목별" 정렬 ("driftDesc" | "evalDesc" | "evalAsc" | "nameAsc" | "nameDesc").
  portfolioStockSortOption: text("portfolioStockSortOption").notNull().default("driftDesc"),
  // 사용자가 선택한 저장소 모드 ("local" | "cloud"). 로그인 시 클라이언트가 이 값을
  // 받아 localStorage 와 동기화한다. 기본 "local" 이라 기존 행도 안전.
  storageMode: text("storageMode").notNull().default("local"),
  // 사용자가 저장소 모드를 직접 고른 시각. null 이면 로그인 뒤 저장 방식 선택 화면을 보여 준다.
  storageModeChosenAt: timestamp("storageModeChosenAt", { precision: 3, mode: "date" }),
  // 동기화 v2 공통 열 (설정은 사용자당 하나라 id 대신 userId 가 키, 목록 순서 없음).
  ...syncColumns(),
  changeSeq: changeSeqColumn(),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// ─── OTA app bundles ────────────────────────────────────────────────────────

/** Postgres `bytea` (postgres-js 는 Buffer 로 주고받는다). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * OTA 앱 번들 (`@seedbook/domain/app-bundle`, 서버 `apps/web/server/app-bundles/`). 워크플로
 * (`.github/workflows/app-bundle.yml`) 가 운영자 API 로 올린다. 올리면 beta 채널, `promotedAt` 이 있으면
 * production 채널 (`rolloutPercent` 만큼의 기기), `haltedAt` 이 있으면 어느 채널에도 내주지 않는다.
 */
export const appBundle = seedbook.table(
  "app_bundle",
  {
    // `<커밋 sha 12자>-<run 번호>` (domain `isAppBundleId`).
    id: text("id").primaryKey(),
    // 번들을 만든 코드의 앱 버전과, 돌 수 있는 가장 낮은 바이너리 버전 (semver).
    appVersion: text("appVersion").notNull(),
    minNative: text("minNative").notNull(),
    // 번들을 만든 커밋 sha.
    build: text("build").notNull(),
    // zip 의 SHA-256 (hex) 과 그 값에 대한 RSA 서명 (base64).
    checksum: text("checksum").notNull(),
    signature: text("signature").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    promotedAt: timestamp("promotedAt", { precision: 3, mode: "date" }),
    rolloutPercent: integer("rolloutPercent").notNull().default(100),
    haltedAt: timestamp("haltedAt", { precision: 3, mode: "date" }),
    haltReason: text("haltReason"),
  },
  (t) => [index("app_bundle_createdAt_idx").on(t.createdAt)]
);

/** 번들 zip 본문. 메타와 나눠 목록·확인 쿼리가 본문을 읽지 않게 한다. 오래된 것은 지운다. */
export const appBundleFile = seedbook.table("app_bundle_file", {
  bundleId: text("bundleId")
    .primaryKey()
    .references(() => appBundle.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/**
 * 기기가 보고한 적용 결과 (domain `APP_BUNDLE_OUTCOMES`). 기기(`installId`, 앱 설치마다 무작위)·결과마다
 * 한 행 — 같은 기기가 여러 번 보내도 한 번만 센다. 사용자와 잇지 않는다.
 */
export const appBundleReport = seedbook.table(
  "app_bundle_report",
  {
    bundleId: text("bundleId")
      .notNull()
      .references(() => appBundle.id, { onDelete: "cascade" }),
    installId: text("installId").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.bundleId, t.installId, t.outcome],
      name: "app_bundle_report_pkey",
    }),
  ]
);

// ─── Relations (for Drizzle relational query API) ───────────────────────────

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  investmentAccounts: many(investmentAccount),
  portfolios: many(portfolio),
  rebalancings: many(rebalancing),
  plantHarvests: many(plantHarvest),
  preference: one(userPreference, { fields: [user.id], references: [userPreference.userId] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const investmentAccountRelations = relations(investmentAccount, ({ one, many }) => ({
  user: one(user, { fields: [investmentAccount.userId], references: [user.id] }),
  portfolio: one(portfolio, {
    fields: [investmentAccount.portfolioId],
    references: [portfolio.id],
  }),
  records: many(investmentRecord),
  holdings: many(stockHolding),
  cashItems: many(cashItem),
}));

export const investmentRecordRelations = relations(investmentRecord, ({ one }) => ({
  account: one(investmentAccount, {
    fields: [investmentRecord.accountId],
    references: [investmentAccount.id],
  }),
}));

export const stockHoldingRelations = relations(stockHolding, ({ one }) => ({
  account: one(investmentAccount, {
    fields: [stockHolding.accountId],
    references: [investmentAccount.id],
  }),
}));

export const cashItemRelations = relations(cashItem, ({ one }) => ({
  account: one(investmentAccount, {
    fields: [cashItem.accountId],
    references: [investmentAccount.id],
  }),
}));

export const portfolioRelations = relations(portfolio, ({ one, many }) => ({
  user: one(user, { fields: [portfolio.userId], references: [user.id] }),
  allocations: many(portfolioAllocation),
  accounts: many(investmentAccount),
}));

export const plantHarvestRelations = relations(plantHarvest, ({ one }) => ({
  user: one(user, { fields: [plantHarvest.userId], references: [user.id] }),
}));

export const rebalancingRelations = relations(rebalancing, ({ one }) => ({
  user: one(user, { fields: [rebalancing.userId], references: [user.id] }),
}));

export const portfolioAllocationRelations = relations(portfolioAllocation, ({ one }) => ({
  portfolio: one(portfolio, {
    fields: [portfolioAllocation.portfolioId],
    references: [portfolio.id],
  }),
}));

export const stockRelations = relations(stock, ({ many }) => ({
  prices: many(stockPrice),
}));

export const stockPriceRelations = relations(stockPrice, ({ one }) => ({
  stock: one(stock, {
    fields: [stockPrice.stockMarket, stockPrice.stockTicker],
    references: [stock.market, stock.ticker],
  }),
}));

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, { fields: [userPreference.userId], references: [user.id] }),
}));
