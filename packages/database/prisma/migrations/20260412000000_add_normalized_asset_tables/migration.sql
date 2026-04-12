-- ============================================================================
-- Normalized asset tables + user preference tables
-- ============================================================================

-- CreateTable (Investments)
CREATE TABLE "seedbook"."investment_account" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountOwner" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "initialInvestment" BIGINT NOT NULL,
    "currentValue" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "investment_account_userId_idx" ON "seedbook"."investment_account"("userId");

CREATE TABLE "seedbook"."investment_record" (
    "accountId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "initialInvestment" BIGINT NOT NULL,
    "currentValue" BIGINT NOT NULL,

    CONSTRAINT "investment_record_pkey" PRIMARY KEY ("accountId","date")
);

CREATE INDEX "investment_record_accountId_date_idx" ON "seedbook"."investment_record"("accountId", "date");

CREATE TABLE "seedbook"."stock_holding" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "stock_holding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_holding_accountId_idx" ON "seedbook"."stock_holding"("accountId");

CREATE TABLE "seedbook"."cash_item" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "cash_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_item_accountId_idx" ON "seedbook"."cash_item"("accountId");

-- CreateTable (Savings)
CREATE TABLE "seedbook"."savings_account" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountOwner" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "interestRate" DOUBLE PRECISION,
    "note" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "savings_account_userId_idx" ON "seedbook"."savings_account"("userId");

CREATE TABLE "seedbook"."savings_record" (
    "accountId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "savings_record_pkey" PRIMARY KEY ("accountId","date")
);

CREATE INDEX "savings_record_accountId_date_idx" ON "seedbook"."savings_record"("accountId", "date");

-- CreateTable (Debts)
CREATE TABLE "seedbook"."debt" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "loanName" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "loanOwner" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "maturityDate" DATE,
    "monthlyPayment" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "debt_userId_idx" ON "seedbook"."debt"("userId");

-- CreateTable (Real Assets)
CREATE TABLE "seedbook"."real_asset" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "assetOwner" TEXT NOT NULL,
    "currentValue" BIGINT NOT NULL,
    "purchaseValue" BIGINT NOT NULL,
    "purchaseDate" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "real_asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "real_asset_userId_idx" ON "seedbook"."real_asset"("userId");

CREATE TABLE "seedbook"."real_asset_custom_owner" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "real_asset_custom_owner_pkey" PRIMARY KEY ("userId","name")
);

-- CreateTable (Asset Plans)
CREATE TABLE "seedbook"."asset_plan" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planPeriod" INTEGER NOT NULL,
    "totalMonthlyContribution" BIGINT NOT NULL,
    "averageTargetReturn" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_plan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asset_plan_userId_idx" ON "seedbook"."asset_plan"("userId");

CREATE TABLE "seedbook"."asset_plan_account_item" (
    "planId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "accountKind" TEXT NOT NULL,
    "contributionAmount" BIGINT NOT NULL,
    "contributionFrequency" TEXT NOT NULL,
    "targetAnnualReturn" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "asset_plan_account_item_pkey" PRIMARY KEY ("planId","accountId")
);

CREATE INDEX "asset_plan_account_item_planId_idx" ON "seedbook"."asset_plan_account_item"("planId");

-- CreateTable (Progress)
CREATE TABLE "seedbook"."asset_progress_point" (
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalAssets" BIGINT NOT NULL,
    "netAssets" BIGINT NOT NULL,
    "investments" BIGINT NOT NULL,
    "savings" BIGINT NOT NULL,
    "realAssets" BIGINT NOT NULL,
    "loans" BIGINT NOT NULL,

    CONSTRAINT "asset_progress_point_pkey" PRIMARY KEY ("userId","date")
);

CREATE INDEX "asset_progress_point_userId_date_idx" ON "seedbook"."asset_progress_point"("userId", "date");

-- CreateTable (User preferences — UI settings separated from data)
CREATE TABLE "seedbook"."user_preference" (
    "userId" TEXT NOT NULL,
    "holdingsSortOption" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "seedbook"."user_list_order" (
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "order" TEXT[],

    CONSTRAINT "user_list_order_pkey" PRIMARY KEY ("userId","domain")
);

CREATE INDEX "user_list_order_userId_idx" ON "seedbook"."user_list_order"("userId");

-- AddForeignKey
ALTER TABLE "seedbook"."investment_account" ADD CONSTRAINT "investment_account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."investment_record" ADD CONSTRAINT "investment_record_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."stock_holding" ADD CONSTRAINT "stock_holding_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."cash_item" ADD CONSTRAINT "cash_item_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."savings_account" ADD CONSTRAINT "savings_account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."savings_record" ADD CONSTRAINT "savings_record_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "seedbook"."savings_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."debt" ADD CONSTRAINT "debt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."real_asset" ADD CONSTRAINT "real_asset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."real_asset_custom_owner" ADD CONSTRAINT "real_asset_custom_owner_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."asset_plan" ADD CONSTRAINT "asset_plan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."asset_plan_account_item" ADD CONSTRAINT "asset_plan_account_item_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "seedbook"."asset_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."asset_progress_point" ADD CONSTRAINT "asset_progress_point_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."user_preference" ADD CONSTRAINT "user_preference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seedbook"."user_list_order" ADD CONSTRAINT "user_list_order_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
