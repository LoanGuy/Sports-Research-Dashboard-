CREATE TABLE "game_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"game_pk" integer,
	"game_date" text,
	"home_probable" jsonb,
	"away_probable" jsonb,
	"home_lineup" jsonb NOT NULL,
	"away_lineup" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_context_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "player_game_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"player_key" text NOT NULL,
	"stat_group" text NOT NULL,
	"season" text,
	"logs" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_logs_key_idx" ON "player_game_logs" USING btree ("player_key","stat_group");
