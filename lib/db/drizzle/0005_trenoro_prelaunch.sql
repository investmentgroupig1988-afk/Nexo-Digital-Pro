ALTER TABLE "user" ADD COLUMN "terms_version" varchar(32);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_version" varchar(32);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "legal_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "adult_confirmed_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "consumer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"email" varchar(320) NOT NULL,
	"payment_reference" varchar(255),
	"description" text,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"admin_notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_requests_type_valid" CHECK ("consumer_requests"."type" IN ('WITHDRAWAL', 'SERVICE_CANCELLATION')),
	CONSTRAINT "consumer_requests_status_valid" CHECK ("consumer_requests"."status" IN ('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'COMPLETED'))
);--> statement-breakpoint
CREATE TABLE "consumer_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" text,
	"status" varchar(16) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "consumer_requests" ADD CONSTRAINT "consumer_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_request_events" ADD CONSTRAINT "consumer_request_events_request_id_consumer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."consumer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_request_events" ADD CONSTRAINT "consumer_request_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_requests_code_unique" ON "consumer_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "consumer_requests_status_created_index" ON "consumer_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "consumer_requests_email_created_index" ON "consumer_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "consumer_request_events_request_created_index" ON "consumer_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
UPDATE "signals" SET "strategy_version" = 'TRENORO_CONFLUENCE_V1' WHERE "strategy_version" = 'NEXO_CONFLUENCE_V1';
