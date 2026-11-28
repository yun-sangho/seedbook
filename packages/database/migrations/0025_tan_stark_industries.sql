DROP TABLE "seedbook"."user_list_order" CASCADE;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account" DROP COLUMN "sellCostPercent";--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" DROP COLUMN "accountIds";--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing" DROP COLUMN "tasks";--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" DROP COLUMN "investmentTrendRange";