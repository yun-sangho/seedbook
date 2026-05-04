/**
 * Drizzle schema. 모든 테이블은 seedbook 스키마에 위치한다.
 * Postgres 의 default 스키마(public)는 사용하지 않는다.
 *
 * Prisma `prisma/schema.prisma` 와 1:1 대응. 컬럼 타입/제약/인덱스/관계 모두 보존.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgSchema,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const seedbook = pgSchema("seedbook");

// ─── Stock master ───────────────────────────────────────────────────────────

export const stock = seedbook.table(
  "Stock",
  {
    market: text("market").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("KRW"),
    sector: text("sector"),
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
  ],
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
      t.date,
    ),
    index("StockPrice_date_idx").on(t.date),
    index("StockPrice_stockMarket_stockTicker_idx").on(t.stockMarket, t.stockTicker),
  ],
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
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("investment_account_userId_idx").on(t.userId)],
);

export const investmentRecord = seedbook.table(
  "investment_record",
  {
    accountId: uuid("accountId")
      .notNull()
      .references(() => investmentAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    initialInvestment: bigint("initialInvestment", { mode: "bigint" }).notNull(),
    currentValue: bigint("currentValue", { mode: "bigint" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.date], name: "investment_record_pkey" }),
    index("investment_record_accountId_date_idx").on(t.accountId, t.date),
  ],
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
  },
  (t) => [index("stock_holding_accountId_idx").on(t.accountId)],
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
  },
  (t) => [index("cash_item_accountId_idx").on(t.accountId)],
);

// ─── Savings ────────────────────────────────────────────────────────────────

export const savingsAccount = seedbook.table(
  "savings_account",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accountName: text("accountName").notNull(),
    accountType: text("accountType").notNull(),
    currency: text("currency").notNull(),
    balance: bigint("balance", { mode: "bigint" }).notNull(),
    interestRate: doublePrecision("interestRate"),
    note: text("note").notNull().default(""),
    color: text("color").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("savings_account_userId_idx").on(t.userId)],
);

export const savingsRecord = seedbook.table(
  "savings_record",
  {
    accountId: uuid("accountId")
      .notNull()
      .references(() => savingsAccount.id, { onDelete: "cascade", onUpdate: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    balance: bigint("balance", { mode: "bigint" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.date], name: "savings_record_pkey" }),
    index("savings_record_accountId_date_idx").on(t.accountId, t.date),
  ],
);

// ─── Debts ──────────────────────────────────────────────────────────────────

export const debt = seedbook.table(
  "debt",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    loanName: text("loanName").notNull(),
    loanType: text("loanType").notNull(),
    lender: text("lender").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    interestRate: doublePrecision("interestRate").notNull(),
    maturityDate: date("maturityDate", { mode: "date" }),
    monthlyPayment: bigint("monthlyPayment", { mode: "bigint" }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("debt_userId_idx").on(t.userId)],
);

// ─── Real Assets ────────────────────────────────────────────────────────────

export const realAsset = seedbook.table(
  "real_asset",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetName: text("assetName").notNull(),
    assetType: text("assetType").notNull(),
    currentValue: bigint("currentValue", { mode: "bigint" }).notNull(),
    purchaseValue: bigint("purchaseValue", { mode: "bigint" }).notNull(),
    purchaseDate: date("purchaseDate", { mode: "date" }),
    note: text("note").notNull().default(""),
    color: text("color").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("real_asset_userId_idx").on(t.userId)],
);

// ─── Asset Plans ────────────────────────────────────────────────────────────

export const assetPlan = seedbook.table(
  "asset_plan",
  {
    id: uuid("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    planName: text("planName").notNull(),
    planPeriod: integer("planPeriod").notNull(),
    totalMonthlyContribution: bigint("totalMonthlyContribution", { mode: "bigint" }).notNull(),
    averageTargetReturn: doublePrecision("averageTargetReturn").notNull(),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("asset_plan_userId_idx").on(t.userId)],
);

export const assetPlanAccountItem = seedbook.table(
  "asset_plan_account_item",
  {
    planId: uuid("planId")
      .notNull()
      .references(() => assetPlan.id, { onDelete: "cascade", onUpdate: "cascade" }),
    accountId: uuid("accountId").notNull(),
    accountKind: text("accountKind").notNull(),
    contributionAmount: bigint("contributionAmount", { mode: "bigint" }).notNull(),
    contributionFrequency: text("contributionFrequency").notNull(),
    targetAnnualReturn: doublePrecision("targetAnnualReturn").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.accountId], name: "asset_plan_account_item_pkey" }),
    index("asset_plan_account_item_planId_idx").on(t.planId),
  ],
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
    description: text("description").notNull().default(""),
    color: text("color").notNull(),
    note: text("note").notNull().default(""),
    accountIds: uuid("accountIds").array().notNull().default(sql`ARRAY[]::uuid[]`),
    driftThresholdPercent: doublePrecision("driftThresholdPercent").notNull().default(5),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("portfolio_userId_idx").on(t.userId)],
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
  },
  (t) => [index("portfolio_allocation_portfolioId_idx").on(t.portfolioId)],
);

// ─── Progress ───────────────────────────────────────────────────────────────

export const assetProgressPoint = seedbook.table(
  "asset_progress_point",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    totalAssets: bigint("totalAssets", { mode: "bigint" }).notNull(),
    netAssets: bigint("netAssets", { mode: "bigint" }).notNull(),
    investments: bigint("investments", { mode: "bigint" }).notNull(),
    savings: bigint("savings", { mode: "bigint" }).notNull(),
    realAssets: bigint("realAssets", { mode: "bigint" }).notNull(),
    loans: bigint("loans", { mode: "bigint" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date], name: "asset_progress_point_pkey" }),
    index("asset_progress_point_userId_date_idx").on(t.userId, t.date),
  ],
);

// ─── User preferences / list orders ─────────────────────────────────────────

export const userPreference = seedbook.table("user_preference", {
  userId: text("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  holdingsSortOption: text("holdingsSortOption").notNull().default("default"),
});

export const userListOrder = seedbook.table(
  "user_list_order",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    domain: text("domain").notNull(),
    order: text("order").array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.domain], name: "user_list_order_pkey" }),
    index("user_list_order_userId_idx").on(t.userId),
  ],
);

// ─── Data sharing ───────────────────────────────────────────────────────────

export const dataShare = seedbook.table(
  "data_share",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerUserId: text("ownerUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    code: text("code").notNull().unique(),
    label: text("label"),
    revokedAt: timestamp("revokedAt", { precision: 3, mode: "date" }),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("data_share_ownerUserId_idx").on(t.ownerUserId)],
);

export const dataShareAcceptance = seedbook.table(
  "data_share_acceptance",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    shareId: uuid("shareId")
      .notNull()
      .references(() => dataShare.id, { onDelete: "cascade", onUpdate: "cascade" }),
    recipientUserId: text("recipientUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    acceptedAt: timestamp("acceptedAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("data_share_acceptance_shareId_recipientUserId_key").on(
      t.shareId,
      t.recipientUserId,
    ),
    index("data_share_acceptance_recipientUserId_idx").on(t.recipientUserId),
  ],
);

export const dataShareInvite = seedbook.table(
  "data_share_invite",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    shareId: uuid("shareId")
      .notNull()
      .references(() => dataShare.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token: text("token").notNull().unique(),
    label: text("label"),
    expiresAt: timestamp("expiresAt", { precision: 3, mode: "date" }).notNull(),
    consumedAt: timestamp("consumedAt", { precision: 3, mode: "date" }),
    consumedByUserId: text("consumedByUserId").references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("data_share_invite_shareId_idx").on(t.shareId)],
);

// ─── Relations (for Drizzle relational query API) ───────────────────────────

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  investmentAccounts: many(investmentAccount),
  savingsAccounts: many(savingsAccount),
  debts: many(debt),
  realAssets: many(realAsset),
  assetPlans: many(assetPlan),
  assetProgressPoints: many(assetProgressPoint),
  portfolios: many(portfolio),
  preference: one(userPreference, { fields: [user.id], references: [userPreference.userId] }),
  listOrders: many(userListOrder),
  sharesOwned: many(dataShare),
  sharesReceived: many(dataShareAcceptance),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const investmentAccountRelations = relations(investmentAccount, ({ one, many }) => ({
  user: one(user, { fields: [investmentAccount.userId], references: [user.id] }),
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

export const savingsAccountRelations = relations(savingsAccount, ({ one, many }) => ({
  user: one(user, { fields: [savingsAccount.userId], references: [user.id] }),
  records: many(savingsRecord),
}));

export const savingsRecordRelations = relations(savingsRecord, ({ one }) => ({
  account: one(savingsAccount, {
    fields: [savingsRecord.accountId],
    references: [savingsAccount.id],
  }),
}));

export const debtRelations = relations(debt, ({ one }) => ({
  user: one(user, { fields: [debt.userId], references: [user.id] }),
}));

export const realAssetRelations = relations(realAsset, ({ one }) => ({
  user: one(user, { fields: [realAsset.userId], references: [user.id] }),
}));

export const assetPlanRelations = relations(assetPlan, ({ one, many }) => ({
  user: one(user, { fields: [assetPlan.userId], references: [user.id] }),
  accountItems: many(assetPlanAccountItem),
}));

export const assetPlanAccountItemRelations = relations(assetPlanAccountItem, ({ one }) => ({
  plan: one(assetPlan, { fields: [assetPlanAccountItem.planId], references: [assetPlan.id] }),
}));

export const portfolioRelations = relations(portfolio, ({ one, many }) => ({
  user: one(user, { fields: [portfolio.userId], references: [user.id] }),
  allocations: many(portfolioAllocation),
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

export const assetProgressPointRelations = relations(assetProgressPoint, ({ one }) => ({
  user: one(user, { fields: [assetProgressPoint.userId], references: [user.id] }),
}));

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
  user: one(user, { fields: [userPreference.userId], references: [user.id] }),
}));

export const userListOrderRelations = relations(userListOrder, ({ one }) => ({
  user: one(user, { fields: [userListOrder.userId], references: [user.id] }),
}));

export const dataShareRelations = relations(dataShare, ({ one, many }) => ({
  owner: one(user, { fields: [dataShare.ownerUserId], references: [user.id] }),
  acceptances: many(dataShareAcceptance),
  invites: many(dataShareInvite),
}));

export const dataShareAcceptanceRelations = relations(dataShareAcceptance, ({ one }) => ({
  share: one(dataShare, { fields: [dataShareAcceptance.shareId], references: [dataShare.id] }),
  recipient: one(user, {
    fields: [dataShareAcceptance.recipientUserId],
    references: [user.id],
  }),
}));

export const dataShareInviteRelations = relations(dataShareInvite, ({ one }) => ({
  share: one(dataShare, { fields: [dataShareInvite.shareId], references: [dataShare.id] }),
  consumedBy: one(user, {
    fields: [dataShareInvite.consumedByUserId],
    references: [user.id],
  }),
}));
