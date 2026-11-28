ALTER TABLE "seedbook"."plant_harvest" ADD COLUMN "plantName" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."plant_harvest" ADD COLUMN "wishHistory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "plantName" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "wishHistory" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "stageGoals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "stageBase" bigint;