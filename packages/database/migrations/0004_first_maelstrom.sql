ALTER TABLE "seedbook"."debt" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."debt" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."user_list_order" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "debt_userId_updatedAt_idx" ON "seedbook"."debt" USING btree ("userId","updatedAt");