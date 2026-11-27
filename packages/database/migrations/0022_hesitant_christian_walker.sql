ALTER TABLE "seedbook"."portfolio" ADD COLUMN "goalAmount" bigint;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "growthStage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "goalHistory" jsonb DEFAULT '[]'::jsonb NOT NULL;