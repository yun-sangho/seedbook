CREATE TABLE "seedbook"."rebalancing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"accountName" text NOT NULL,
	"portfolioId" text NOT NULL,
	"portfolioName" text NOT NULL,
	"cashDelta" bigint NOT NULL,
	"tasks" jsonb NOT NULL,
	"startedAt" timestamp (3) NOT NULL,
	"completedAt" timestamp (3),
	"version" integer DEFAULT 1 NOT NULL,
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seedbook"."rebalancing" ADD CONSTRAINT "rebalancing_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "rebalancing_userId_idx" ON "seedbook"."rebalancing" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "rebalancing_userId_updatedAt_idx" ON "seedbook"."rebalancing" USING btree ("userId","updatedAt");