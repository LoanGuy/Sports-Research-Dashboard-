CREATE TABLE "trends" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_date" text NOT NULL,
	"player_name" text NOT NULL,
	"player_key" text NOT NULL,
	"team" text,
	"market" text NOT NULL,
	"side" text DEFAULT 'over' NOT NULL,
	"line" double precision,
	"odds_american" integer,
	"signals" jsonb NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trends_game_date_idx" ON "trends" USING btree ("game_date");
