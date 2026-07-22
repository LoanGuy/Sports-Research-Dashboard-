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

/**
 * Personal bet journal. Every ticket — wins AND losses — so hit rates and
 * ROI can be computed per category with honest sample sizes. Legs are
 * stored as JSON: [{ description, market, oddsAmerican, line, result }].
 */
export const bets = pgTable(
  "bets",
  {
    id: serial("id").primaryKey(),
    placedOn: text("placed_on"), // "YYYY-MM-DD" or null when unknown
    platform: text("platform").notNull().default("other"),
    betType: text("bet_type").notNull(), // "straight" | "parlay" | "sgp"
    legCount: integer("leg_count").notNull().default(1),
    oddsAmerican: doublePrecision("odds_american"),
    stake: doublePrecision("stake").notNull(),
    payout: doublePrecision("payout").notNull().default(0),
    result: text("result").notNull().default("pending"), // won|lost|push|pending
    boostPct: doublePrecision("boost_pct"),
    bonusBet: boolean("bonus_bet").notNull().default(false),
    notes: text("notes"),
    legs: jsonb("legs").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bets_placed_idx").on(t.placedOn)],
);

/**
 * User-supplied trend research for a game day (e.g. parsed from Linemate
 * screenshots). Trends are matched to collected markets by player and
 * market and fill the "Recent form" / "Matchup" grade categories. Signals
 * are stored as JSON: [{ kind, label, hits, total }].
 */
export const trends = pgTable(
  "trends",
  {
    id: serial("id").primaryKey(),
    gameDate: text("game_date").notNull(), // "YYYY-MM-DD" (ET)
    playerName: text("player_name").notNull(),
    playerKey: text("player_key").notNull(),
    team: text("team"),
    market: text("market").notNull(),
    side: text("side").notNull().default("over"), // "over" | "under"
    line: doublePrecision("line"),
    oddsAmerican: integer("odds_american"),
    signals: jsonb("signals").notNull(),
    note: text("note"),
    source: text("source").notNull().default("manual"), // "upload" | "manual"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trends_game_date_idx").on(t.gameDate)],
);

/**
 * MLB game context from the free MLB Stats API: probable pitchers and
 * (once posted) confirmed lineups, matched to our events. Drives lineup
 * gating and pitcher-confirmation notes in grading.
 */
export const gameContext = pgTable("game_context", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().unique(),
  gamePk: integer("game_pk"),
  gameDate: text("game_date"),
  homeProbable: jsonb("home_probable"), // { id, fullName } | null
  awayProbable: jsonb("away_probable"),
  homeLineup: jsonb("home_lineup").notNull(), // [{ id, fullName, order? }]
  awayLineup: jsonb("away_lineup").notNull(),
  weather: jsonb("weather"), // StoredWeather | null (NWS forecast at first pitch)
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-player recent game logs (verified stats, not screenshots). */
export const playerGameLogs = pgTable(
  "player_game_logs",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    playerKey: text("player_key").notNull(),
    statGroup: text("stat_group").notNull(), // "hitting" | "pitching"
    season: text("season"),
    logs: jsonb("logs").notNull(), // [{ date, stats: {...} }] newest last
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("player_logs_key_idx").on(t.playerKey, t.statGroup)],
);

/**
 * Every surfaced opportunity is snapshotted so the system can be audited
 * and calibrated: did A-grade cards actually win at the rate the market
 * math implied? Settled manually from the History page for now.
 */
export const opportunitySnapshots = pgTable(
  "opportunity_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotKey: text("snapshot_key").notNull().unique(), // dateEt|opportunityId
    gameDate: text("game_date").notNull(),
    surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull(),
    eventId: integer("event_id"),
    eventName: text("event_name").notNull(),
    player: text("player"),
    market: text("market").notNull(),
    side: text("side").notNull(),
    line: doublePrecision("line"),
    platform: text("platform").notNull(),
    offeredOdds: doublePrecision("offered_odds"),
    consensusProb: doublePrecision("consensus_prob"),
    breakEvenProb: doublePrecision("break_even_prob"),
    edgePts: doublePrecision("edge_pts").notNull(),
    grade: text("grade").notNull(),
    gradeBasis: text("grade_basis").notNull().default("price"), // price | price+trends | price+verified
    settledResult: text("settled_result"), // won | lost | push | void | null
    settledAt: timestamp("settled_at", { withTimezone: true }),
    closingOdds: doublePrecision("closing_odds"),
  },
  (t) => [index("opp_snapshots_date_idx").on(t.gameDate)],
);

/** In-app alerts (edge appeared, lineup problem). No push — a feed. */
export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // "edge" | "lineup"
    message: text("message").notNull(),
    eventId: integer("event_id"),
    snapshotKey: text("snapshot_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("alerts_created_idx").on(t.createdAt)],
);

export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type Trend = typeof trends.$inferSelect;
export type NewTrend = typeof trends.$inferInsert;
export type GameContext = typeof gameContext.$inferSelect;
export type PlayerGameLog = typeof playerGameLogs.$inferSelect;
export type OpportunitySnapshot = typeof opportunitySnapshots.$inferSelect;
export type Alert = typeof alerts.$inferSelect;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type MarketRecord = typeof marketRecords.$inferSelect;
export type NewMarketRecord = typeof marketRecords.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;
