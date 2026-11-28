CREATE TABLE "seedbook"."plant_harvest" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"sourceType" text DEFAULT 'portfolio' NOT NULL,
	"sourceId" text NOT NULL,
	"sourceName" text NOT NULL,
	"season" integer NOT NULL,
	"plantKind" text NOT NULL,
	"wish" text DEFAULT '' NOT NULL,
	"goals" jsonb NOT NULL,
	"harvestedAt" timestamp (3) NOT NULL,
	"doneAt" timestamp (3),
	"version" integer DEFAULT 1 NOT NULL,
	"deletedAt" timestamp (3),
	"changeSeq" bigint DEFAULT 0 NOT NULL,
	"sortKey" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "season" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "plantKind" text;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "wish" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "fruitGoal" jsonb;--> statement-breakpoint
ALTER TABLE "seedbook"."portfolio" ADD COLUMN "driftSince" timestamp (3);--> statement-breakpoint
ALTER TABLE "seedbook"."plant_harvest" ADD CONSTRAINT "plant_harvest_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "plant_harvest_userId_idx" ON "seedbook"."plant_harvest" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "plant_harvest_userId_changeSeq_idx" ON "seedbook"."plant_harvest" USING btree ("userId","changeSeq");