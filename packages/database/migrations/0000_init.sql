CREATE SCHEMA "seedbook";
--> statement-breakpoint
CREATE TABLE "seedbook"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp (3),
	"refreshTokenExpiresAt" timestamp (3),
	"scope" text,
	"password" text,
	"createdAt" timestamp (3) NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."asset_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"planName" text NOT NULL,
	"planPeriod" integer NOT NULL,
	"totalMonthlyContribution" bigint NOT NULL,
	"averageTargetReturn" double precision NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."asset_plan_account_item" (
	"planId" uuid NOT NULL,
	"accountId" uuid NOT NULL,
	"accountKind" text NOT NULL,
	"contributionAmount" bigint NOT NULL,
	"contributionFrequency" text NOT NULL,
	"targetAnnualReturn" double precision NOT NULL,
	CONSTRAINT "asset_plan_account_item_pkey" PRIMARY KEY("planId","accountId")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."asset_progress_point" (
	"userId" text NOT NULL,
	"date" date NOT NULL,
	"totalAssets" bigint NOT NULL,
	"netAssets" bigint NOT NULL,
	"investments" bigint NOT NULL,
	"savings" bigint NOT NULL,
	"realAssets" bigint NOT NULL,
	"loans" bigint NOT NULL,
	CONSTRAINT "asset_progress_point_pkey" PRIMARY KEY("userId","date")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."cash_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"accountId" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."data_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerUserId" text NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"revokedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "data_share_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."data_share_acceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shareId" uuid NOT NULL,
	"recipientUserId" text NOT NULL,
	"acceptedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."debt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"loanName" text NOT NULL,
	"loanType" text NOT NULL,
	"lender" text NOT NULL,
	"amount" bigint NOT NULL,
	"interestRate" double precision NOT NULL,
	"maturityDate" date,
	"monthlyPayment" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."investment_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountName" text NOT NULL,
	"accountType" text NOT NULL,
	"currency" text NOT NULL,
	"initialInvestment" bigint NOT NULL,
	"currentValue" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."investment_record" (
	"accountId" uuid NOT NULL,
	"date" date NOT NULL,
	"initialInvestment" bigint NOT NULL,
	"currentValue" bigint NOT NULL,
	CONSTRAINT "investment_record_pkey" PRIMARY KEY("accountId","date")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."portfolio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"accountIds" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"driftThresholdPercent" double precision DEFAULT 5 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."portfolio_allocation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portfolioId" uuid NOT NULL,
	"market" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"targetPercent" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."real_asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"assetName" text NOT NULL,
	"assetType" text NOT NULL,
	"currentValue" bigint NOT NULL,
	"purchaseValue" bigint NOT NULL,
	"purchaseDate" date,
	"note" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."savings_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountName" text NOT NULL,
	"accountType" text NOT NULL,
	"currency" text NOT NULL,
	"balance" bigint NOT NULL,
	"interestRate" double precision,
	"note" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."savings_record" (
	"accountId" uuid NOT NULL,
	"date" date NOT NULL,
	"balance" bigint NOT NULL,
	CONSTRAINT "savings_record_pkey" PRIMARY KEY("accountId","date")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp (3) NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."Stock" (
	"market" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"sector" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Stock_pkey" PRIMARY KEY("market","ticker")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."stock_holding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"accountId" uuid NOT NULL,
	"market" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"quantity" double precision NOT NULL,
	"memo" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."StockPrice" (
	"id" serial PRIMARY KEY NOT NULL,
	"stockMarket" text NOT NULL,
	"stockTicker" text NOT NULL,
	"date" timestamp (3) with time zone NOT NULL,
	"open" bigint NOT NULL,
	"high" bigint NOT NULL,
	"low" bigint NOT NULL,
	"close" bigint NOT NULL,
	"volume" bigint NOT NULL,
	"marketCap" bigint,
	"change" bigint
);
--> statement-breakpoint
CREATE TABLE "seedbook"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp (3) NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."user_list_order" (
	"userId" text NOT NULL,
	"domain" text NOT NULL,
	"order" text[] NOT NULL,
	CONSTRAINT "user_list_order_pkey" PRIMARY KEY("userId","domain")
);
--> statement-breakpoint
CREATE TABLE "seedbook"."user_preference" (
	"userId" text PRIMARY KEY NOT NULL,
	"holdingsSortOption" text DEFAULT 'default' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3),
	"updatedAt" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "seedbook"."account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."asset_plan" ADD CONSTRAINT "asset_plan_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."asset_plan_account_item" ADD CONSTRAINT "asset_plan_account_item_planId_asset_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "seedbook"."asset_plan"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."asset_progress_point" ADD CONSTRAINT "asset_progress_point_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD CONSTRAINT "cash_item_accountId_investment_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."data_share" ADD CONSTRAINT "data_share_ownerUserId_user_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."data_share_acceptance" ADD CONSTRAINT "data_share_acceptance_shareId_data_share_id_fk" FOREIGN KEY ("shareId") REFERENCES "seedbook"."data_share"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."data_share_acceptance" ADD CONSTRAINT "data_share_acceptance_recipientUserId_user_id_fk" FOREIGN KEY ("recipientUserId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."debt" ADD CONSTRAINT "debt_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account" ADD CONSTRAINT "investment_account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD CONSTRAINT "investment_record_accountId_investment_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD CONSTRAINT "portfolio_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD CONSTRAINT "portfolio_allocation_portfolioId_portfolio_id_fk" FOREIGN KEY ("portfolioId") REFERENCES "seedbook"."portfolio"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."real_asset" ADD CONSTRAINT "real_asset_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."savings_account" ADD CONSTRAINT "savings_account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."savings_record" ADD CONSTRAINT "savings_record_accountId_savings_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "seedbook"."savings_account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD CONSTRAINT "stock_holding_accountId_investment_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."user_list_order" ADD CONSTRAINT "user_list_order_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD CONSTRAINT "user_preference_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_plan_userId_idx" ON "seedbook"."asset_plan" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "asset_plan_account_item_planId_idx" ON "seedbook"."asset_plan_account_item" USING btree ("planId");--> statement-breakpoint
CREATE INDEX "asset_progress_point_userId_date_idx" ON "seedbook"."asset_progress_point" USING btree ("userId","date");--> statement-breakpoint
CREATE INDEX "cash_item_accountId_idx" ON "seedbook"."cash_item" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "data_share_ownerUserId_idx" ON "seedbook"."data_share" USING btree ("ownerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "data_share_acceptance_shareId_recipientUserId_key" ON "seedbook"."data_share_acceptance" USING btree ("shareId","recipientUserId");--> statement-breakpoint
CREATE INDEX "data_share_acceptance_recipientUserId_idx" ON "seedbook"."data_share_acceptance" USING btree ("recipientUserId");--> statement-breakpoint
CREATE INDEX "debt_userId_idx" ON "seedbook"."debt" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "investment_account_userId_idx" ON "seedbook"."investment_account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "investment_record_accountId_date_idx" ON "seedbook"."investment_record" USING btree ("accountId","date");--> statement-breakpoint
CREATE INDEX "portfolio_userId_idx" ON "seedbook"."portfolio" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "portfolio_allocation_portfolioId_idx" ON "seedbook"."portfolio_allocation" USING btree ("portfolioId");--> statement-breakpoint
CREATE INDEX "real_asset_userId_idx" ON "seedbook"."real_asset" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "savings_account_userId_idx" ON "seedbook"."savings_account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "savings_record_accountId_date_idx" ON "seedbook"."savings_record" USING btree ("accountId","date");--> statement-breakpoint
CREATE INDEX "Stock_market_idx" ON "seedbook"."Stock" USING btree ("market");--> statement-breakpoint
CREATE INDEX "Stock_isActive_idx" ON "seedbook"."Stock" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "Stock_name_idx" ON "seedbook"."Stock" USING btree ("name");--> statement-breakpoint
CREATE INDEX "stock_holding_accountId_idx" ON "seedbook"."stock_holding" USING btree ("accountId");--> statement-breakpoint
CREATE UNIQUE INDEX "StockPrice_stockMarket_stockTicker_date_key" ON "seedbook"."StockPrice" USING btree ("stockMarket","stockTicker","date");--> statement-breakpoint
CREATE INDEX "StockPrice_date_idx" ON "seedbook"."StockPrice" USING btree ("date");--> statement-breakpoint
CREATE INDEX "StockPrice_stockMarket_stockTicker_idx" ON "seedbook"."StockPrice" USING btree ("stockMarket","stockTicker");--> statement-breakpoint
CREATE INDEX "user_list_order_userId_idx" ON "seedbook"."user_list_order" USING btree ("userId");