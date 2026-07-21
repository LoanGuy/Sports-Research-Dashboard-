/**
 * Live opportunity builder.
 *
 * Reads the newest batch of stored market rows, removes the vig per
 * bookmaker, takes the median fair probability as the market consensus,
 * and surfaces prices that beat that consensus. The core is a pure
 * function (buildOpportunities) so the math is unit-testable without a
 * database.
 *
 * Grading honesty: only "Market value" and "Data confidence" can be graded
 * from odds alone. Matchup, recent form, and conditions are Incomplete
 * until the stats/weather phases land — shown as such, never faked.
 */
import { desc, eq, gt } from "drizzle-orm";
import { events, marketRecords, type Event, type MarketRecord } from "@shared/schema";
import type { Consensus, Grade, GradeCategory, Opportunity } from "@shared/types";
import { americanToImpliedProb, median, noVigFromAmerican, probToAmerican } from "@shared/odds";
import { getDb, isDbConfigured } from "./db";

const EDGE_THRESHOLD_PTS = 1.5;
const MAX_OPPORTUNITIES = 30;

const BOOK_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  espnbet: "ESPN Bet",
  williamhill: "William Hill",
  pointsbet: "PointsBet",
  unibet: "Unibet",
  bovada: "Bovada",
};

export function bookDisplayName(id: string): string {
  return BOOK_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function formatEventTime(startTime: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(startTime)} ET`;
}

function ageMinutes(from: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
}

function marketGrade(edgePts: number): Grade {
  if (edgePts >= 4) return "A";
  if (edgePts >= 2.5) return "B";
  if (edgePts >= 1.5) return "C";
  return "D";
}

function confidenceGrade(sourceCount: number, disagreement: Consensus["disagreement"]): Grade {
  if (sourceCount >= 6 && disagreement === "low") return "A";
  if (sourceCount >= 4) return "B";
  if (sourceCount >= 3) return "C";
  return "D";
}

export function buildOpportunities(
  rows: MarketRecord[],
  eventById: Map<number, Event>,
  now: Date,
): Opportunity[] {
  // Group rows (one per bookmaker) into markets.
  const groups = new Map<string, MarketRecord[]>();
  for (const row of rows) {
    if (row.overOdds == null || row.underOdds == null || row.eventId == null) continue;
    const key = [row.eventId, row.marketType, row.playerId ?? "", row.line ?? "", row.marketPeriod].join("|");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const candidates: Opportunity[] = [];

  for (const groupRows of Array.from(groups.values())) {
    // One quote per book (newest wins if duplicates exist).
    const byBook = new Map<string, MarketRecord>();
    for (const row of groupRows) byBook.set(bookKey(row), row);
    const quotes = Array.from(byBook.values());
    if (quotes.length < 3) continue; // need a real consensus

    const fairOverProbs: number[] = [];
    for (const quote of quotes) {
      try {
        fairOverProbs.push(noVigFromAmerican(quote.overOdds!, quote.underOdds!).fairProbs[0]);
      } catch {
        // skip malformed odds
      }
    }
    if (fairOverProbs.length < 3) continue;

    const consensusProb = median(fairOverProbs);
    const low = Math.min(...fairOverProbs);
    const high = Math.max(...fairOverProbs);
    const range = high - low;
    const disagreement: Consensus["disagreement"] = range < 0.03 ? "low" : range < 0.06 ? "moderate" : "high";

    const sample = quotes[0];
    const event = eventById.get(sample.eventId!);
    if (!event) continue;
    const retrieved = sample.retrievedAt;
    const age = ageMinutes(retrieved, now);
    const freshness = age <= 20 ? "delayed" : age <= 60 ? "stale" : "stale";
    const consensus: Consensus = {
      fairProb: consensusProb,
      sourceCount: fairOverProbs.length,
      lowProb: low,
      highProb: high,
      disagreement,
      lastUpdated: `${age} min ago`,
    };

    // Find the single best price on each side across books.
    for (const side of ["over", "under"] as const) {
      let best: { quote: MarketRecord; edgePts: number; breakEven: number; odds: number } | null = null;
      for (const quote of quotes) {
        const odds = side === "over" ? quote.overOdds! : quote.underOdds!;
        let breakEven: number;
        try {
          breakEven = americanToImpliedProb(odds);
        } catch {
          continue;
        }
        const fairForSide = side === "over" ? consensusProb : 1 - consensusProb;
        const edgePts = (fairForSide - breakEven) * 100;
        if (!best || edgePts > best.edgePts) best = { quote, edgePts, breakEven, odds };
      }
      if (!best || best.edgePts < EDGE_THRESHOLD_PTS) continue;

      const book = bookKey(best.quote);
      const bookName = bookDisplayName(book);
      const sideLabel = side === "over" ? "Over" : "Under";
      const fairForSide = side === "over" ? consensusProb : 1 - consensusProb;
      const mGrade = marketGrade(best.edgePts);
      const dGrade = confidenceGrade(consensus.sourceCount, disagreement);

      const categories: GradeCategory[] = [
        {
          key: "market",
          label: "Market value",
          grade: mGrade,
          weightPct: 30,
          note: `${bookName}'s price needs a ${(best.breakEven * 100).toFixed(1)}% win rate. ${consensus.sourceCount} books put the fair chance near ${(fairForSide * 100).toFixed(1)}%.`,
        },
        { key: "matchup", label: "Matchup", grade: "Incomplete", weightPct: 25, note: "Not yet analyzed — player/team stats land in a later phase." },
        { key: "form", label: "Recent form", grade: "Incomplete", weightPct: 15, note: "Not yet analyzed — game logs land in a later phase." },
        { key: "conditions", label: "Conditions", grade: "Incomplete", weightPct: 10, note: "Not yet analyzed — weather and lineups land in a later phase." },
        {
          key: "data",
          label: "Data confidence",
          grade: dGrade,
          weightPct: 15,
          note: `${consensus.sourceCount} books compared; disagreement is ${disagreement}. Odds on this data plan are about 10 minutes delayed.`,
        },
        { key: "risk", label: "Risk", grade: "C", weightPct: 5, note: "Price-only signal. Without matchup and lineup context, treat the edge as provisional." },
      ];

      const playerPart = best.quote.playerName ? `${best.quote.playerName} ` : "";
      candidates.push({
        id: `live-${best.quote.eventId}-${slug(best.quote.marketType)}-${slug(best.quote.playerId ?? "team")}-${book}-${side}`,
        origin: "live",
        sport: "mlb",
        league: "MLB",
        eventName: `${event.awayTeam} @ ${event.homeTeam}`,
        eventTime: formatEventTime(event.startTime),
        player: best.quote.playerName,
        opponent: `${event.awayTeam} @ ${event.homeTeam}`,
        market: best.quote.marketType,
        period: best.quote.marketPeriod === "game" ? "Full game" : best.quote.marketPeriod,
        side: sideLabel,
        line: best.quote.line ?? 0,
        platform: book,
        offeredOdds: best.odds,
        payoutNote: null,
        breakEvenProb: best.breakEven,
        consensus,
        edgePts: Number(best.edgePts.toFixed(1)),
        grade: mGrade,
        gradeLabel: mGrade,
        categories,
        recentForm: [],
        summary: `${bookName} requires this pick to win about ${(best.breakEven * 100).toFixed(0)}% of the time to break even. The broader market estimates a ${(fairForSide * 100).toFixed(0)}% chance. The estimated difference is about ${best.edgePts.toFixed(1)} percentage points.`,
        whyItGradesWell: [
          `${consensus.sourceCount} sportsbooks were compared, with each book's vig removed separately before taking the median.`,
          `${bookName} posts the best available price on the ${sideLabel} side of this market.`,
        ],
        whatCouldGoWrong: [
          "Odds on this data plan are about 10 minutes delayed; the live price may have moved.",
          "Matchup, lineup, and weather context is not analyzed yet — this is a price-only signal.",
          `${playerPart ? "A lineup change or early exit could void the assumptions behind this line." : "Game conditions can shift totals quickly."}`,
        ],
        bottomLine: `The available line appears favorable against the ${consensus.sourceCount}-book market estimate. Treat it as provisional until matchup analysis is added.`,
        dataConfidence: dGrade === "A" ? "high" : dGrade === "B" ? "medium" : "low",
        dataConfidenceNote: `${consensus.sourceCount} books, ${disagreement} disagreement, collected ${consensus.lastUpdated}. Provider odds are ~10 minutes delayed on the current plan.`,
        freshness,
        lastUpdated: consensus.lastUpdated,
        lineMovement: "Line movement tracking begins once multiple collection runs accumulate.",
        sources: quotes.map((quote) => {
          let fair: number | null = null;
          try {
            const fairBoth = noVigFromAmerican(quote.overOdds!, quote.underOdds!).fairProbs;
            fair = side === "over" ? fairBoth[0] : fairBoth[1];
          } catch {
            fair = null;
          }
          return {
            source: bookDisplayName(bookKey(quote)),
            line: quote.line ?? 0,
            sideOdds: side === "over" ? quote.overOdds : quote.underOdds,
            fairProb: fair,
            freshness: quote.freshness as "fresh" | "delayed" | "stale" | "unavailable" | "partial",
            lastUpdated: consensus.lastUpdated,
          };
        }),
        matchNeedsReview: false,
        weather: null,
        lineupStatus: null,
        lineupNote: null,
        novig: null,
        prizepicks: null,
      });
    }
  }

  candidates.sort((a, b) => b.edgePts - a.edgePts);
  return candidates.slice(0, MAX_OPPORTUNITIES);
}

function bookKey(row: MarketRecord): string {
  return row.bookmaker ?? row.source;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export interface LiveFeed {
  origin: "live" | "none";
  generatedAt: string;
  count: number;
  opportunities: Opportunity[];
  reason?: string;
}

async function getLatestRowsAndEvents(): Promise<{ rows: MarketRecord[]; eventById: Map<number, Event> } | null> {
  if (!isDbConfigured()) return null;
  const db = getDb();
  const newest = await db
    .select({ retrievedAt: marketRecords.retrievedAt })
    .from(marketRecords)
    .orderBy(desc(marketRecords.retrievedAt))
    .limit(1);
  if (newest.length === 0) return null;
  const cutoff = new Date(newest[0].retrievedAt.getTime() - 5 * 60 * 1000);
  const rows = await db.select().from(marketRecords).where(gt(marketRecords.retrievedAt, cutoff));

  const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter((id): id is number => id != null)));
  const eventById = new Map<number, Event>();
  for (const id of eventIds) {
    const found = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (found.length > 0) eventById.set(id, found[0]);
  }
  return { rows, eventById };
}

export async function getLiveFeed(): Promise<LiveFeed> {
  const generatedAt = new Date().toISOString();
  const latest = await getLatestRowsAndEvents();
  if (!latest) {
    return {
      origin: "none",
      generatedAt,
      count: 0,
      opportunities: [],
      reason: isDbConfigured() ? "No collected data yet" : "Database not configured",
    };
  }
  const opportunities = buildOpportunities(latest.rows, latest.eventById, new Date());
  return { origin: "live", generatedAt, count: opportunities.length, opportunities };
}

/**
 * All consensus markets from the newest batch (no edge threshold) — powers
 * the manual price check: the user enters a Hard Rock (or any book) price
 * and compares it against this fair-probability estimate.
 */
export interface ConsensusMarket {
  key: string;
  eventName: string;
  eventTime: string;
  market: string;
  playerName: string | null;
  line: number | null;
  period: string;
  sourceCount: number;
  fairOverProb: number;
  lowProb: number;
  highProb: number;
  disagreement: "low" | "moderate" | "high";
  lastUpdated: string;
}

export function buildConsensusMarkets(
  rows: MarketRecord[],
  eventById: Map<number, Event>,
  now: Date,
): ConsensusMarket[] {
  const groups = new Map<string, MarketRecord[]>();
  for (const row of rows) {
    if (row.overOdds == null || row.underOdds == null || row.eventId == null) continue;
    const key = [row.eventId, row.marketType, row.playerId ?? "", row.line ?? "", row.marketPeriod].join("|");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const markets: ConsensusMarket[] = [];
  for (const [key, groupRows] of Array.from(groups.entries())) {
    const byBook = new Map<string, MarketRecord>();
    for (const row of groupRows) byBook.set(bookKey(row), row);
    const quotes = Array.from(byBook.values());
    if (quotes.length < 3) continue;

    const fairOverProbs: number[] = [];
    for (const quote of quotes) {
      try {
        fairOverProbs.push(noVigFromAmerican(quote.overOdds!, quote.underOdds!).fairProbs[0]);
      } catch {
        // skip malformed odds
      }
    }
    if (fairOverProbs.length < 3) continue;

    const event = eventById.get(quotes[0].eventId!);
    if (!event) continue;
    const range = Math.max(...fairOverProbs) - Math.min(...fairOverProbs);
    markets.push({
      key,
      eventName: `${event.awayTeam} @ ${event.homeTeam}`,
      eventTime: formatEventTime(event.startTime),
      market: quotes[0].marketType,
      playerName: quotes[0].playerName,
      line: quotes[0].line,
      period: quotes[0].marketPeriod === "game" ? "Full game" : quotes[0].marketPeriod,
      sourceCount: fairOverProbs.length,
      fairOverProb: median(fairOverProbs),
      lowProb: Math.min(...fairOverProbs),
      highProb: Math.max(...fairOverProbs),
      disagreement: range < 0.03 ? "low" : range < 0.06 ? "moderate" : "high",
      lastUpdated: `${ageMinutes(quotes[0].retrievedAt, now)} min ago`,
    });
  }

  markets.sort((a, b) => a.eventName.localeCompare(b.eventName) || a.market.localeCompare(b.market));
  return markets;
}

export async function getConsensusFeed(): Promise<{ origin: "live" | "none"; generatedAt: string; markets: ConsensusMarket[]; reason?: string }> {
  const generatedAt = new Date().toISOString();
  const latest = await getLatestRowsAndEvents();
  if (!latest) {
    return {
      origin: "none",
      generatedAt,
      markets: [],
      reason: isDbConfigured() ? "No collected data yet" : "Database not configured",
    };
  }
  return { origin: "live", generatedAt, markets: buildConsensusMarkets(latest.rows, latest.eventById, new Date()) };
}
