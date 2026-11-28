CREATE TABLE "seedbook"."app_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"appVersion" text NOT NULL,
	"minNative" text NOT NULL,
	"build" text NOT NULL,
	"checksum" text NOT NULL,
	"signature" text NOT NULL,
	"size" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"promotedAt" timestamp (3),
	"rolloutPercent" integer DEFAULT 100 NOT NULL,
	"haltedAt" timestamp (3),
	"haltReason" text
);
--> statement-breakpoint
CREATE TABLE "seedbook"."app_bundle_file" (
	"bundleId" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."app_bundle_report" (
	"bundleId" text NOT NULL,
	"installId" text NOT NULL,
	"outcome" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "app_bundle_report_pkey" PRIMARY KEY("bundleId","installId","outcome")
);
--> statement-breakpoint
ALTER TABLE "seedbook"."app_bundle_file" ADD CONSTRAINT "app_bundle_file_bundleId_app_bundle_id_fk" FOREIGN KEY ("bundleId") REFERENCES "seedbook"."app_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seedbook"."app_bundle_report" ADD CONSTRAINT "app_bundle_report_bundleId_app_bundle_id_fk" FOREIGN KEY ("bundleId") REFERENCES "seedbook"."app_bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_bundle_createdAt_idx" ON "seedbook"."app_bundle" USING btree ("createdAt");