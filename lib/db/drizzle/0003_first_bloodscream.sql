ALTER TABLE "signals" ADD COLUMN "configuration_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "signals" SET
  "strategy_version" = COALESCE("strategy_version", 'LEGACY'),
  "indicator_snapshot" = COALESCE("indicator_snapshot", '{}'::jsonb),
  "configuration_fingerprint" = COALESCE("configuration_fingerprint", md5("id"::text) || md5("id"::text || ':legacy')),
  "expires_at" = COALESCE("expires_at", "opened_at", "created_at");--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "strategy_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "indicator_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "configuration_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_open_strategy_unique" ON "signals" USING btree ("symbol","timeframe","strategy_version") WHERE "signals"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "signals_configuration_unique" ON "signals" USING btree ("configuration_fingerprint");--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_direction_valid" CHECK ("signals"."direction" IN ('LONG', 'SHORT')) NOT VALID;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_status_valid" CHECK ("signals"."status" IN ('OPEN', 'WIN', 'LOSS', 'EXPIRED', 'CANCELLED')) NOT VALID;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_risk_reward_minimum" CHECK ("signals"."risk_reward_ratio" >= 1.5) NOT VALID;
