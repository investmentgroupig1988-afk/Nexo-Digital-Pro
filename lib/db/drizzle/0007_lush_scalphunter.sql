CREATE TABLE "shadow_research_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_version" varchar(64) NOT NULL,
	"strategy_fingerprint" varchar(64) NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"timeframe" varchar(8) NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"source_candle_close_at" timestamp with time zone NOT NULL,
	"hypothetical_entry" numeric(20, 8) NOT NULL,
	"hypothetical_stop" numeric(20, 8) NOT NULL,
	"hypothetical_target" numeric(20, 8) NOT NULL,
	"direction" varchar(16) NOT NULL,
	"costs_model" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"realized_r" numeric(16, 8),
	"technical_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shadow_research_signal_version_frozen" CHECK ("shadow_research_signals"."strategy_version" = 'RSI_DIVERGENCE_STRUCTURAL_4H_V1'),
	CONSTRAINT "shadow_research_signal_symbol_valid" CHECK ("shadow_research_signals"."symbol" IN ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT')),
	CONSTRAINT "shadow_research_signal_timeframe_frozen" CHECK ("shadow_research_signals"."timeframe" = '4h'),
	CONSTRAINT "shadow_research_signal_direction_valid" CHECK ("shadow_research_signals"."direction" IN ('LONG', 'SHORT')),
	CONSTRAINT "shadow_research_signal_status_valid" CHECK ("shadow_research_signals"."status" IN ('OPEN', 'WIN', 'LOSS', 'EXPIRED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_research_signal_dedupe_unique" ON "shadow_research_signals" USING btree ("strategy_version","symbol","timeframe","source_candle_close_at","direction");--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_research_signal_open_unique" ON "shadow_research_signals" USING btree ("strategy_version","symbol","timeframe") WHERE "shadow_research_signals"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "shadow_research_signal_status_index" ON "shadow_research_signals" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "shadow_research_signal_symbol_index" ON "shadow_research_signals" USING btree ("symbol","detected_at");