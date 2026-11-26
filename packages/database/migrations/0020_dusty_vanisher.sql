CREATE TABLE "seedbook"."legal_document" (
	"document" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"effectiveDate" date NOT NULL,
	"requiresConsent" boolean NOT NULL,
	"publishedAt" timestamp (3) NOT NULL,
	CONSTRAINT "legal_document_pkey" PRIMARY KEY("document","version")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_document_effectiveDate_key" ON "seedbook"."legal_document" USING btree ("document","effectiveDate");