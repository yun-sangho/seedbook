CREATE TABLE "seedbook"."investment_account_snapshot" (
	"accountId" uuid NOT NULL,
	"userId" text NOT NULL,
	"date" date NOT NULL,
	"stockValue" bigint NOT NULL,
	"cashValue" bigint NOT NULL,
	"totalValue" bigint NOT NULL,
	"holdingCount" integer NOT NULL,
	"missingPriceCount" integer NOT NULL,
	"oldestPriceDate" date,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "investment_account_snapshot_pkey" PRIMARY KEY("accountId","date")
);
--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account_snapshot" ADD CONSTRAINT "investment_account_snapshot_accountId_investment_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "seedbook"."investment_account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account_snapshot" ADD CONSTRAINT "investment_account_snapshot_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "investment_account_snapshot_userId_date_idx" ON "seedbook"."investment_account_snapshot" USING btree ("userId","date");