CREATE TABLE "seedbook"."device_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"userAgent" text,
	"createdAt" timestamp (3) NOT NULL,
	"lastUsedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seedbook"."device_credential" ADD CONSTRAINT "device_credential_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "device_credential_userId_idx" ON "seedbook"."device_credential" USING btree ("userId");