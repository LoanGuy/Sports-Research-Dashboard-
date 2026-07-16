CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"sport" text NOT NULL,
	"league" text NOT NULL,
	"tournament" text,
	"start_time" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"event_id" integer,
	"player_name" text,
	"player_id" text,
	"market_type" text NOT NULL,
	"market_period" text DEFAULT 'full' NOT NULL,
	"line" double precision,
	"over_odds" double precision,
	"under_odds" double precision,
	"yes_price_cents" double precision,
	"no_price_cents" double precision,
	"bid_cents" double precision,
	"ask_cents" double precision,
	"projection" double precision,
	"payout_multiplier" double precision,
	"is_live" boolean DEFAULT false NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"grading_rules" text,
	"source_status" text DEFAULT 'ok' NOT NULL,
	"freshness" text DEFAULT 'fresh' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_records" ADD CONSTRAINT "market_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "events_sport_start_idx" ON "events" USING btree ("sport","start_time");--> statement-breakpoint
CREATE INDEX "market_records_event_idx" ON "market_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "market_records_source_idx" ON "market_records" USING btree ("source","retrieved_at");--> statement-breakpoint
CREATE INDEX "market_records_market_idx" ON "market_records" USING btree ("market_type","player_name");