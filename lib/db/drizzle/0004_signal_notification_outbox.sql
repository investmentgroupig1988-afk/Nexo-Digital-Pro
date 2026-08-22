CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_provider_valid" CHECK ("notification_deliveries"."provider" IN ('telegram')),
	CONSTRAINT "notification_deliveries_status_valid" CHECK ("notification_deliveries"."status" IN ('PENDING', 'SENDING', 'DELIVERED', 'FAILED'))
);--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_signal_provider_unique" ON "notification_deliveries" USING btree ("signal_id","provider");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_index" ON "notification_deliveries" USING btree ("provider","status","next_attempt_at");
