CREATE TABLE "bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"placed_on" text,
	"platform" text DEFAULT 'other' NOT NULL,
	"bet_type" text NOT NULL,
	"leg_count" integer DEFAULT 1 NOT NULL,
	"odds_american" double precision,
	"stake" double precision NOT NULL,
	"payout" double precision DEFAULT 0 NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"boost_pct" double precision,
	"bonus_bet" boolean DEFAULT false NOT NULL,
	"notes" text,
	"legs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bets_placed_idx" ON "bets" USING btree ("placed_on");