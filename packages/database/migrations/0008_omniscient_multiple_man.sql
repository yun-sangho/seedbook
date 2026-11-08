ALTER TABLE "seedbook"."savings_account" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."savings_account" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
CREATE INDEX "savings_account_userId_updatedAt_idx" ON "seedbook"."savings_account" USING btree ("userId","updatedAt");