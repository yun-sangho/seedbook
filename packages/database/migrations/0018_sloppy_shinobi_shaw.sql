CREATE TABLE "seedbook"."user_consent" (
	"userId" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"agreedAt" timestamp (3) NOT NULL,
	CONSTRAINT "user_consent_pkey" PRIMARY KEY("userId","document","version")
);
--> statement-breakpoint
ALTER TABLE "seedbook"."user_consent" ADD CONSTRAINT "user_consent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;