CREATE TABLE "seedbook"."data_share_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shareId" uuid NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expiresAt" timestamp (3) NOT NULL,
	"consumedAt" timestamp (3),
	"consumedByUserId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "data_share_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "seedbook"."data_share_invite" ADD CONSTRAINT "data_share_invite_shareId_data_share_id_fk" FOREIGN KEY ("shareId") REFERENCES "seedbook"."data_share"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."data_share_invite" ADD CONSTRAINT "data_share_invite_consumedByUserId_user_id_fk" FOREIGN KEY ("consumedByUserId") REFERENCES "seedbook"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "data_share_invite_shareId_idx" ON "seedbook"."data_share_invite" USING btree ("shareId");