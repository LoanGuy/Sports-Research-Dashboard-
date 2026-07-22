CREATE TABLE "opportunity_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_key" text NOT NULL,
	"game_date" text NOT NULL,
	"surfaced_at" timestamp with time zone NOT NULL,
	"event_id" integer,
	"event_name" text NOT NULL,
	"player" text,
	"market" text NOT NULL,
	"side" text NOT NULL,
	"line" double precision,
	"platform" text NOT NULL,
	"offered_odds" double precision,
	"consensus_prob" double precision,
	"break_even_prob" double precision,
	"edge_pts" double precision NOT NULL,
	"grade" text NOT NULL,
	"grade_basis" text DEFAULT 'price' NOT NULL,
	"settled_result" text,
	"settled_at" timestamp with time zone,
	"closing_odds" double precision,
	CONSTRAINT "opportunity_snapshots_snapshot_key_unique" UNIQUE("snapshot_key")
);
--> statement-breakpoint
CREATE INDEX "opp_snapshots_date_idx" ON "opportunity_snapshots" USING btree ("game_date");
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"event_id" integer,
	"snapshot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "alerts_created_idx" ON "alerts" USING btree ("created_at");
