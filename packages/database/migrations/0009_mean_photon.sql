ALTER TABLE "seedbook"."investment_account" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."investment_account" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
CREATE INDEX "investment_account_userId_updatedAt_idx" ON "seedbook"."investment_account" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE INDEX "portfolio_userId_updatedAt_idx" ON "seedbook"."portfolio" USING btree ("userId","updatedAt");