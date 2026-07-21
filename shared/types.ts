/**
 * Shared domain types for the sports research dashboard.
 *
 * These types are used by both the client and (in later phases) the server.
 * Phase 1 is a clickable mockup: all data conforming to these types is
 * hand-written sample data, clearly labeled as such in the UI.
 */

export type Sport = "mlb" | "cbb";

/** Well-known comparison platforms; live data may add sportsbook IDs. */
export type Platform = "hardrock" | "prizepicks" | "novig";

/** Letter grade. "Incomplete" is used when data is missing, never hidden. */
export type Grade = "A" | "B" | "C" | "D" | "Incomplete";

/** Data freshness labels. Old information is never shown as current. */
export type Freshness = "fresh" | "delayed" | "stale" | "unavailable" | "partial";

export type DataConfidence = "high" | "medium" | "low";

export type Liquidity = "high" | "moderate" | "low" | "unknown";

export type LineupStatus =
  | "confirmed"
  | "projected"
  | "not_in_lineup"
  | "unavailable"
  | "recently_changed";

export type RoofStatus =
  | "outdoor"
  | "indoor_fixed"
  | "roof_open_confirmed"
  | "roof_closed_confirmed"
  | "roof_status_expected"
  | "roof_status_unknown";

/** One sportsbook's quote for the same market, after individual no-vig removal. */
export interface MarketSourceQuote {
  source: string;
  line: number;
  /** American odds for the researched side, if this source posts one. */
  sideOdds: number | null;
  /** Fair (no-vig) probability for the researched side, from this source alone. */
  fairProb: number | null;
  freshness: Freshness;
  lastUpdated: string;
  /** True when the line differs from the platform line being researched. */
  lineMismatch?: boolean;
}

/** Median-based consensus across valid sources. */
export interface Consensus {
  /** Median fair probability for the researched side (0..1). */
  fairProb: number;
  sourceCount: number;
  lowProb: number;
  highProb: number;
  disagreement: "low" | "moderate" | "high";
  lastUpdated: string;
}

export interface GradeCategory {
  key: "market" | "matchup" | "form" | "conditions" | "data" | "risk";
  label: string;
  grade: Grade;
  weightPct: number;
  note: string;
}

export interface RecentFormItem {
  label: string;
  hits: number;
  total: number;
}

export interface WeatherInfo {
  venue: string;
  roofStatus: RoofStatus;
  tempF: number | null;
  windMph: number | null;
  windDirection: string | null;
  gustMph: number | null;
  humidityPct: number | null;
  rainProbPct: number | null;
  note: string;
  observedAt: string;
  freshness: Freshness;
}

export interface NoVigMarketState {
  bidCents: number;
  askCents: number;
  midCents: number;
  lastTradeCents: number | null;
  availableUsd: number | null;
  liquidity: Liquidity;
  priceMovement: string;
}

export interface PrizePicksContext {
  /** Sportsbook consensus line for the same stat, for projection comparison. */
  marketLine: number;
  marketLean: string;
  projectionMovement: string;
  specialType: "standard" | "demon" | "goblin" | null;
  correlationWarning: string | null;
}

export interface Opportunity {
  id: string;
  /** Whether this record came from sample data or the live pipeline. */
  origin: "sample" | "live";
  sport: Sport;
  league: string;
  eventName: string;
  eventTime: string;
  player: string | null;
  opponent: string;
  market: string;
  period: string;
  /** Side being researched, e.g. "Over", "Under", "More", "Less", "Yes". */
  side: string;
  line: number;
  /** Platform or sportsbook ID, e.g. "hardrock", "prizepicks", "fanduel". */
  platform: string;
  /** American odds offered by the platform (traditional books). */
  offeredOdds: number | null;
  /** Payout multiplier context (PrizePicks-style platforms). */
  payoutNote: string | null;
  /** Probability the offered price needs to break even (0..1). */
  breakEvenProb: number;
  consensus: Consensus;
  /** consensus.fairProb - breakEvenProb, in percentage points. */
  edgePts: number;
  grade: Grade;
  /** Display grade with modifier, e.g. "B+". */
  gradeLabel: string;
  categories: GradeCategory[];
  recentForm: RecentFormItem[];
  summary: string;
  whyItGradesWell: string[];
  whatCouldGoWrong: string[];
  bottomLine: string;
  dataConfidence: DataConfidence;
  dataConfidenceNote: string;
  freshness: Freshness;
  lastUpdated: string;
  lineMovement: string;
  sources: MarketSourceQuote[];
  /** True when market matching between sources is uncertain. Never guess. */
  matchNeedsReview: boolean;
  weather: WeatherInfo | null;
  lineupStatus: LineupStatus | null;
  lineupNote: string | null;
  novig: NoVigMarketState | null;
  prizepicks: PrizePicksContext | null;
}

/** College basketball live monitor types. */
export interface LiveTeamState {
  name: string;
  shortName: string;
  score: number;
  fouls: number;
  inBonus: boolean;
  inDoubleBonus: boolean;
  ftAttempts: number;
}

export type FoulLight = "gray" | "yellow" | "green";

export interface LiveAlert {
  severity: "info" | "caution";
  message: string;
  time: string;
}

export interface LiveGame {
  id: string;
  home: LiveTeamState;
  away: LiveTeamState;
  half: string;
  clock: string;
  pregameTotal: number;
  liveTotal: number;
  pace: "slow" | "average" | "fast";
  paceNote: string;
  alerts: LiveAlert[];
  freshness: Freshness;
  lastUpdated: string;
}

/** The standing disclaimer used throughout the application. */
export const DISCLAIMER =
  "This dashboard provides research and probability estimates. It does not guarantee results or place wagers. Odds, projections, lineups, injuries, weather, and other information can change quickly.";
