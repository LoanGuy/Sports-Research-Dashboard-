/**
 * PostgreSQL schema (Drizzle ORM).
 *
 * Works with any standard PostgreSQL — Supabase, Neon, Railway, or
 * self-managed — via DATABASE_URL. Tables follow the data-storage rules in
 * the project spec: every odds/projection record carries its source, both
 * timestamps (retrieved and last-changed), and a freshness status so stale
 * information is never presented as current.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Normalized events (one row per real-world game/match). */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    sport: text("sport").notNull(), // "mlb" | "tennis" | "cbb"
    league: text("league").notNull(),
    tournament: text("tournament"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_sport_start_idx").on(t.sport, t.startTime)],
);

/**
 * Raw market records as retrieved from each source. One row per
 * (source, market, side-set) observation; history is preserved by inserting
 * new rows when values change (changedAt tracks the last mutation).
 */
export const marketRecords = pgTable(
  "market_records",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    /** Sportsbook the quote belongs to (source may be an aggregator). */
    bookmaker: text("bookmaker"),
    sourceEventId: text("source_event_id").notNull(),
    eventId: integer("event_id").references(() => events.id),
    playerName: text("player_name"),
    playerId: text("player_id"),
    marketType: text("market_type").notNull(),
    marketPeriod: text("market_period").notNull().default("full"),
    line: doublePrecision("line"),
    overOdds: doublePrecision("over_odds"), // American odds
    underOdds: doublePrecision("under_odds"),
    yesPriceCents: doublePrecision("yes_price_cents"), // exchange-style contracts
    noPriceCents: doublePrecision("no_price_cents"),
    bidCents: doublePrecision("bid_cents"),
    askCents: doublePrecision("ask_cents"),
    projection: doublePrecision("projection"), // PrizePicks-style lines
    payoutMultiplier: doublePrecision("payout_multiplier"),
    isLive: boolean("is_live").notNull().default(false),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    gradingRules: text("grading_rules"),
    sourceStatus: text("source_status").notNull().default("ok"),
    freshness: text("freshness").notNull().default("fresh"),
  },
  (t) => [
    index("market_records_event_idx").on(t.eventId),
    index("market_records_source_idx").on(t.source, t.retrievedAt),
    index("market_records_market_idx").on(t.marketType, t.playerName),
  ],
);

/** Key/value application settings (e.g. grading weights) synced server-side. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit log: grade changes, alerts, data-quality incidents,
 * job runs. The history/audit module reads from here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    category: text("category").notNull(), // "grade" | "alert" | "data-quality" | "job" | "auth"
    message: text("message").notNull(),
    data: jsonb("data"),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type MarketRecord = typeof marketRecords.$inferSelect;
export type NewMarketRecord = typeof marketRecords.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;
