ALTER TABLE "seedbook"."user_preference" ADD COLUMN "accountSortOption" text DEFAULT 'evalDesc' NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "portfolioStockSortOption" text DEFAULT 'driftDesc' NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."user_preference" ADD COLUMN "investmentTrendRange" text DEFAULT '3months' NOT NULL;