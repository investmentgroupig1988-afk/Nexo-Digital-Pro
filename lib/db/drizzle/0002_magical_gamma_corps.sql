CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"method" varchar(64) NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"declared_paid_at" timestamp with time zone NOT NULL,
	"reference_or_txid" varchar(255) NOT NULL,
	"reference_fingerprint" varchar(64) NOT NULL,
	"payer_name" varchar(160),
	"sender_wallet" varchar(128),
	"proof_file_name" varchar(160),
	"proof_mime_type" varchar(64),
	"proof_size" integer,
	"proof_data_base64" text,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_amount_positive" CHECK ("payment_requests"."amount" > 0),
	CONSTRAINT "payment_requests_proof_size_valid" CHECK ("payment_requests"."proof_size" IS NULL OR ("payment_requests"."proof_size" > 0 AND "payment_requests"."proof_size" <= 5242880)),
	CONSTRAINT "payment_requests_method_valid" CHECK ("payment_requests"."method" IN ('MERCADO_PAGO_TRANSFER', 'USDT_TRC20')),
	CONSTRAINT "payment_requests_status_valid" CHECK ("payment_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'))
);
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_requests_user_created_index" ON "payment_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_requests_status_created_index" ON "payment_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_requests_reviewer_index" ON "payment_requests" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_approved_reference_unique" ON "payment_requests" USING btree ("method","reference_fingerprint") WHERE "payment_requests"."status" = 'APPROVED';