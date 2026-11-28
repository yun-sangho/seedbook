CREATE TABLE "seedbook"."rebalancing_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"rebalancingId" uuid NOT NULL,
	"allocationId" text NOT NULL,
	"market" text NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"action" text NOT NULL,
	"amount" double precision NOT NULL,
	"price" double precision,
	"quantity" double precision,
	"priceAsOf" timestamp (3),
	"priceKind" text,
	"executedQuantity" double precision,
	"executedPrice" double precision,
	"orderedQuantity" double precision,
	"orderedPrice" double precision,
	"filledQuantity" double precision,
	"filledAmount" double precision,
	"done" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deletedAt" timestamp (3),
	"changeSeq" bigint DEFAULT 0 NOT NULL,
	"sortKey" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."user_sync_state" (
	"userId" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "id" uuid;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD COLUMN "sortKey" text;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "changeSeq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing_task" ADD CONSTRAINT "rebalancing_task_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing_task" ADD CONSTRAINT "rebalancing_task_rebalancingId_rebalancing_id_fk" FOREIGN KEY ("rebalancingId") REFERENCES "seedbook"."rebalancing"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."user_sync_state" ADD CONSTRAINT "user_sync_state_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "rebalancing_task_rebalancingId_idx" ON "seedbook"."rebalancing_task" USING btree ("rebalancingId");--> statement-breakpoint
CREATE INDEX "rebalancing_task_userId_changeSeq_idx" ON "seedbook"."rebalancing_task" USING btree ("userId","changeSeq");--> statement-breakpoint
ALTER TABLE "seedbook"."cash_item" ADD CONSTRAINT "cash_item_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_record" ADD CONSTRAINT "investment_record_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio_allocation" ADD CONSTRAINT "portfolio_allocation_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."stock_holding" ADD CONSTRAINT "stock_holding_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "cash_item_userId_changeSeq_idx" ON "seedbook"."cash_item" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE INDEX "investment_account_userId_changeSeq_idx" ON "seedbook"."investment_account" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_record_id_key" ON "seedbook"."investment_record" USING btree ("id");--> statement-breakpoint
CREATE INDEX "investment_record_userId_changeSeq_idx" ON "seedbook"."investment_record" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE INDEX "portfolio_userId_changeSeq_idx" ON "seedbook"."portfolio" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE INDEX "portfolio_allocation_userId_changeSeq_idx" ON "seedbook"."portfolio_allocation" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE INDEX "rebalancing_userId_changeSeq_idx" ON "seedbook"."rebalancing" USING btree ("userId","changeSeq");--> statement-breakpoint
CREATE INDEX "stock_holding_userId_changeSeq_idx" ON "seedbook"."stock_holding" USING btree ("userId","changeSeq");