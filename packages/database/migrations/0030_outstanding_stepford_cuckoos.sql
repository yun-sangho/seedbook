CREATE TABLE "seedbook"."push_device" (
	"token" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"sessionId" text NOT NULL,
	"platform" text NOT NULL,
	"appId" text NOT NULL,
	"environment" text NOT NULL,
	"kinds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seedbook"."push_notification_log" (
	"userId" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_log_pkey" PRIMARY KEY("userId","key")
);
--> statement-breakpoint
ALTER TABLE "seedbook"."push_device" ADD CONSTRAINT "push_device_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."push_device" ADD CONSTRAINT "push_device_sessionId_session_id_fk" FOREIGN KEY ("sessionId") REFERENCES "seedbook"."session"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "seedbook"."push_notification_log" ADD CONSTRAINT "push_notification_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "push_device_userId_idx" ON "seedbook"."push_device" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "push_notification_log_userId_date_idx" ON "seedbook"."push_notification_log" USING btree ("userId","date");