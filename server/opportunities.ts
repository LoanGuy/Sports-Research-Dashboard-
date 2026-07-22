/**
 * Live opportunity builder.
 *
 * Reads the newest batch of stored market rows, removes the vig per
 * bookmaker, takes the median fair probability as the market consensus,
 * and surfaces prices that beat that consensus. The core is a pure
 * function (buildOpportunities) so the math is unit-testable without a
 * database.
 *
 * Grading honesty: "Market value" and "Data confidence" are graded from
 * odds alone. "Recent form" and "Matchup" are graded ONLY when the user
 * has uploaded matching trend research for the day; otherwise they stay
 * Incomplete — shown as such, never faked.
 */
import { desc, eq, gt } from "drizzle-orm";
import {
  events,
  marketRecords,
  type Event,
  type GameContext,
  type MarketRecord,
  type PlayerGameLog,
  type Trend,
} from "@shared/schema";
import type { Consensus, Grade, GradeCategory, LineupStatus, Opportunity, RecentFormItem, WeatherInfo } from "@shared/types";
import { americanToImpliedProb, median, noVigFromAmerican } from "@shared/odds";
import { normalizePlayerKey } from "./markets";
import { getDb, isDbConfigured } from "./db";
import { listTrends, todayEt, type TrendSignal } from "./trends";
import { DEFAULT_GRADE_WEIGHTS, getGradeWeights, type GradeWeights } from "./settings";
import {
  loadContext,
  statGroupForMarket,
  verifiedForm,
  type GameLogEntry,
  type LineupSlot,
  type ProbablePitcher,
} from "./mlb";
import { conditionsFromWeather, roofStatusOf, type StoredWeather } from "./weather";

const EDGE_THRESHOLD_PTS = 1.0;
const MAX_OPPORTUNITIES = 30;

/**
 * The bookmakers the user can actually bet. All collected books feed the
 * consensus (they are the measuring stick); only these surface as
 * opportunities. Override with MY_BOOKMAKERS (comma-separated bookmaker
 * IDs); an empty set means "surface any book".
 */
const DEFAULT_MY_BOOKS = ["hardrockbet", "fliff"];

export function myBookmakers(): Set<string> {
  const raw = process.env.MY_BOOKMAKERS;
  if (raw === undefined) return new Set(DEFAULT_MY_BOOKS);
  const list = raw.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean);
  return new Set(list);
}

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
  hardrockbet: "Hard Rock",
  hardrockbet_oh: "Hard Rock (OH)",
  fliff: "Fliff",
  betonlineag: "BetOnline",
  betrivers: "BetRivers",
  ballybet: "Bally Bet",
  betparx: "betPARX",
  mybookieag: "MyBookie",
  lowvig: "LowVig",
  betanysports: "BetAnySports",
  betus: "BetUS",
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

/** Grade a trend signal by hit rate with the sample size as a gate. */
function signalGrade(hits: number, total: number): Grade {
  if (total < 3) return "D"; // too small to mean much either way
  const rate = hits / total;
  if (total >= 8 && rate >= 0.9) return "A";
  if (total >= 5 && rate >= 0.8) return "B";
  if (rate >= 0.7) return "C";
  return "D";
}

/**
 * Match player keys tolerating initials: trend sites often show "b. rice"
 * where the odds feed says "ben rice". Last names must match exactly; a
 * one-letter first name matches any full first name with that initial.
 */
export function playerKeysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = a.split(/\s+/).filter(Boolean);
  const pb = b.split(/\s+/).filter(Boolean);
  if (pa.length < 2 || pb.length < 2) return false;
  if (pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  const fa = pa[0].replace(/\./g, "");
  const fb = pb[0].replace(/\./g, "");
  if (fa.length === 1 || fb.length === 1) return fa[0] === fb[0];
  return false;
}

/** Weighted blend of graded categories → overall letter grade. */
function blendGrades(parts: { grade: Grade; weightPct: number }[]): Grade {
  const points: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
  let sum = 0;
  let weight = 0;
  for (const p of parts) {
    if (p.grade === "Incomplete") continue;
    sum += points[p.grade] * p.weightPct;
    weight += p.weightPct;
  }
  if (weight === 0) return "Incomplete";
  const avg = sum / weight;
  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  return "D";
}

const GRADE_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/** The worse (higher-rank) of two letter grades — used to cap confidence. */
function worseGrade(a: Grade, b: Grade): Grade {
  if (a === "Incomplete") return b;
  if (b === "Incomplete") return a;
  return GRADE_RANK[a] >= GRADE_RANK[b] ? a : b;
}

function fmtAmerican(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

function fmtTimeEt(d: Date): string {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
}

/**
 * Line movement for the surfaced book, computed from stored history rows
 * (every collection run is a snapshot). Returns a plain-language summary
 * plus whether the price has drifted worse for the surfaced side.
 */
export function describeMovement(
  history: MarketRecord[],
  side: "over" | "under",
): { text: string; worsened: boolean } {
  // One row per snapshot time (minute precision), oldest first.
  const byMinute = new Map<number, MarketRecord>();
  for (const row of history) {
    const minute = Math.floor(row.retrievedAt.getTime() / 60000);
    byMinute.set(minute, row);
  }
  const snaps = Array.from(byMinute.values()).sort((a, b) => a.retrievedAt.getTime() - b.retrievedAt.getTime());
  if (snaps.length < 2) {
    return { text: "First snapshot for this market — movement shows after the next collection run.", worsened: false };
  }
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const odds = (r: MarketRecord) => (side === "over" ? r.overOdds : r.underOdds);
  const firstOdds = odds(first);
  const lastOdds = odds(last);
  if (firstOdds == null || lastOdds == null) {
    return { text: "Movement unavailable — this book did not price this side in earlier snapshots.", worsened: false };
  }
  const lineChanged = (first.line ?? 0) !== (last.line ?? 0);
  const oddsChanged = firstOdds !== lastOdds;
  if (!lineChanged && !oddsChanged) {
    return {
      text: `Unchanged across ${snaps.length} snapshots since ${fmtTimeEt(first.retrievedAt)}: ${first.line ?? ""} ${fmtAmerican(lastOdds)}`.trim(),
      worsened: false,
    };
  }
  let worsened = false;
  try {
    worsened = americanToImpliedProb(lastOdds) > americanToImpliedProb(firstOdds) + 0.005;
  } catch {
    worsened = false;
  }
  const fromPart = `${first.line ?? ""} ${fmtAmerican(firstOdds)}`.trim();
  const toPart = `${last.line ?? ""} ${fmtAmerican(lastOdds)}`.trim();
  return {
    text: `${fromPart} → ${toPart} since ${fmtTimeEt(first.retrievedAt)} (${snaps.length} snapshots)`,
    worsened,
  };
}

export interface BuildOptions {
  dayTrends?: Trend[];
  weights?: GradeWeights;
  historyRows?: MarketRecord[];
  contexts?: GameContext[];
  playerLogs?: PlayerGameLog[];
}

export function buildOpportunities(
  rows: MarketRecord[],
  eventById: Map<number, Event>,
  now: Date,
  myBooks: Set<string> = new Set(),
  opts: BuildOptions = {},
): Opportunity[] {
  const dayTrends = opts.dayTrends ?? [];
  const weights = opts.weights ?? DEFAULT_GRADE_WEIGHTS;
  const historyRows = opts.historyRows ?? [];
  const ctxByEvent = new Map((opts.contexts ?? []).map((c) => [c.eventId, c] as const));
  const logRows = opts.playerLogs ?? [];
  // Group rows (one per bookmaker) into markets.
  const groups = new Map<string, MarketRecord[]>();
  for (const row of rows) {
    if (row.overOdds == null || row.underOdds == null || row.eventId == null) continue;
    // Live in-progress games are excluded: collected odds are ~10 minutes
    // delayed on the current plan, and a delayed price on a moving game is
    // not an edge — it is stale information. Pregame markets only.
    if (row.isLive) continue;
    const key = [
      row.eventId,
      row.marketType,
      row.playerName ? normalizePlayerKey(row.playerName) : "",
      row.line ?? "",
      row.marketPeriod,
    ].join("|");
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

    // Surface the best price on each side — restricted to the user's own
    // books when configured. Every collected book still shapes the
    // consensus above; this filter only controls what is bettable.
    const candidateQuotes = myBooks.size > 0 ? quotes.filter((q) => myBooks.has(bookKey(q))) : quotes;
    if (candidateQuotes.length === 0) continue;
    for (const side of ["over", "under"] as const) {
      let best: { quote: MarketRecord; edgePts: number; breakEven: number; odds: number } | null = null;
      for (const quote of candidateQuotes) {
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
      const isMoneyline = quotes[0].marketType === "Moneyline";
      const sideLabel = isMoneyline
        ? side === "over"
          ? `${event.homeTeam} to win`
          : `${event.awayTeam} to win`
        : side === "over"
          ? "Over"
          : "Under";
      const fairForSide = side === "over" ? consensusProb : 1 - consensusProb;
      // Report the consensus for the side actually surfaced, so the card's
      // "Market X%" lines up with the offered price and break-even number.
      const sideConsensus: Consensus =
        side === "over"
          ? consensus
          : { ...consensus, fairProb: 1 - consensusProb, lowProb: 1 - high, highProb: 1 - low };
      const mGrade = marketGrade(best.edgePts);
      const dGradeRaw = confidenceGrade(consensus.sourceCount, disagreement);

      // Match the user's uploaded trend research for this player + market
      // + side. Trends grade "Recent form" and (when a versus-opponent
      // signal exists) "Matchup"; without a trend those stay Incomplete.
      const rowPlayerKey = best.quote.playerName ? normalizePlayerKey(best.quote.playerName) : null;
      const trend = rowPlayerKey
        ? dayTrends.find(
            (t) => t.side === side && t.market === best.quote.marketType && playerKeysMatch(t.playerKey, rowPlayerKey),
          )
        : undefined;
      const trendSignals: TrendSignal[] = trend ? ((trend.signals as TrendSignal[]) ?? []) : [];
      const formSignal = trendSignals.find((s) => s.kind === "recent") ?? trendSignals[0];
      const matchupSignal = trendSignals.find((s) => s.kind === "vs_opponent");

      // Verified recent form from stored MLB game logs (preferred over
      // screenshot trends when available).
      const statGroup = rowPlayerKey ? statGroupForMarket(best.quote.marketType) : null;
      const logRow =
        statGroup && rowPlayerKey
          ? logRows.find((l) => l.statGroup === statGroup && playerKeysMatch(l.playerKey, rowPlayerKey))
          : undefined;
      const verified =
        logRow && best.quote.line != null
          ? verifiedForm(logRow.logs as GameLogEntry[], best.quote.marketType, side, best.quote.line)
          : null;

      const recentForm: RecentFormItem[] = [
        ...(verified ? [{ label: verified.label, hits: verified.hits, total: verified.total }] : []),
        ...trendSignals.map((s) => ({ label: s.label, hits: s.hits, total: s.total })),
      ];

      // Lineup / probable-starter gating from MLB game context.
      const ctx = best.quote.eventId != null ? ctxByEvent.get(best.quote.eventId) : undefined;
      let lineupStatus: LineupStatus | null = null;
      let lineupNote: string | null = null;
      let confidenceCap: Grade | null = null;
      let contextReviewFlag = false;
      const whyContext: string[] = [];
      const riskContext: string[] = [];
      if (ctx && rowPlayerKey && statGroup === "hitting") {
        const lineup = [...((ctx.homeLineup as LineupSlot[]) ?? []), ...((ctx.awayLineup as LineupSlot[]) ?? [])];
        if (lineup.length === 0) {
          lineupStatus = "unavailable";
          lineupNote = "Lineups are not posted yet for this game (MLB Stats API).";
          confidenceCap = "C";
          riskContext.push(
            "Lineup not posted yet — a batter prop carries extra uncertainty until this player is confirmed in the lineup.",
          );
        } else {
          const slot = lineup.find((p) => playerKeysMatch(normalizePlayerKey(p.fullName), rowPlayerKey));
          if (slot) {
            lineupStatus = "confirmed";
            lineupNote = slot.order
              ? `In the posted lineup, batting ${slot.order} (MLB Stats API).`
              : "In the posted lineup (MLB Stats API).";
            whyContext.push(lineupNote);
          } else {
            lineupStatus = "not_in_lineup";
            lineupNote = "Not in the posted lineup (MLB Stats API) — this prop may not settle.";
            confidenceCap = "D";
            contextReviewFlag = true;
            riskContext.push("This player is NOT in the posted lineup — verify before considering this market.");
          }
        }
      }
      if (ctx && rowPlayerKey && statGroup === "pitching") {
        const probables = [ctx.homeProbable, ctx.awayProbable].filter(Boolean) as ProbablePitcher[];
        if (probables.length > 0) {
          const starter = probables.find((p) => playerKeysMatch(normalizePlayerKey(p.fullName), rowPlayerKey));
          if (starter) {
            lineupStatus = "confirmed";
            lineupNote = "Listed as a probable starter for this game (MLB Stats API).";
            whyContext.push(lineupNote);
          } else {
            lineupStatus = "not_in_lineup";
            lineupNote = "Not one of this game's listed probable starters (MLB Stats API).";
            confidenceCap = "C";
            contextReviewFlag = true;
            riskContext.push("This pitcher is not a listed probable starter — verify the starter before trusting this prop.");
          }
        }
      }

      const formCategory: GradeCategory = verified
        ? {
            key: "form",
            label: "Recent form",
            grade: signalGrade(verified.hits, verified.total),
            weightPct: weights.form,
            note: `${verified.label}.`,
          }
        : formSignal
        ? {
            key: "form",
            label: "Recent form",
            grade: signalGrade(formSignal.hits, formSignal.total),
            weightPct: weights.form,
            note: `${formSignal.label} (${formSignal.hits}/${formSignal.total}) — from your uploaded trend.`,
          }
        : { key: "form", label: "Recent form", grade: "Incomplete", weightPct: weights.form, note: "No trend uploaded for this player today. Add one on the Trends page." };
      const matchupCategory: GradeCategory = matchupSignal
        ? {
            key: "matchup",
            label: "Matchup",
            grade: signalGrade(matchupSignal.hits, matchupSignal.total),
            weightPct: weights.matchup,
            note: `${matchupSignal.label} (${matchupSignal.hits}/${matchupSignal.total}) — from your uploaded trend.`,
          }
        : { key: "matchup", label: "Matchup", grade: "Incomplete", weightPct: weights.matchup, note: "Not yet analyzed — upload a versus-opponent trend or wait for the stats phase." };

      const dGrade = confidenceCap ? worseGrade(dGradeRaw, confidenceCap) : dGradeRaw;

      // Conditions from the stored NWS forecast (spec §19). Weather is one
      // factor; without a forecast the category stays Incomplete.
      const storedWeather = (ctx?.weather ?? null) as StoredWeather | null;
      const conditions = storedWeather ? conditionsFromWeather(storedWeather) : null;
      const weatherInfo: WeatherInfo | null = storedWeather
        ? {
            venue: storedWeather.venue,
            roofStatus: roofStatusOf(storedWeather),
            tempF: storedWeather.tempF,
            windMph: storedWeather.windMph,
            windDirection: storedWeather.windDirection,
            gustMph: null,
            humidityPct: null,
            rainProbPct: storedWeather.rainProbPct,
            note: conditions?.note ?? "",
            observedAt: storedWeather.capturedAt,
            freshness:
              Date.now() - Date.parse(storedWeather.capturedAt) < 90 * 60 * 1000 ? "fresh" : "stale",
          }
        : null;

      const categories: GradeCategory[] = [
        {
          key: "market",
          label: "Market value",
          grade: mGrade,
          weightPct: weights.market,
          note: `${bookName}'s price needs a ${(best.breakEven * 100).toFixed(1)}% win rate. ${consensus.sourceCount} books put the fair chance near ${(fairForSide * 100).toFixed(1)}%.`,
        },
        matchupCategory,
        formCategory,
        conditions
          ? {
              key: "conditions",
              label: "Conditions",
              grade: conditions.grade,
              weightPct: weights.conditions,
              note: `${conditions.note} (National Weather Service forecast for first pitch.)`,
            }
          : {
              key: "conditions",
              label: "Conditions",
              grade: "Incomplete",
              weightPct: weights.conditions,
              note: trend?.note
                ? `From your upload: ${trend.note}. Not independently verified.`
                : "No forecast stored for this game yet — refresh market data to fetch one.",
            },
        {
          key: "data",
          label: "Data confidence",
          grade: dGrade,
          weightPct: weights.data,
          note: `${consensus.sourceCount} books compared; disagreement is ${disagreement}. Odds on this data plan are about 10 minutes delayed.${
            confidenceCap ? ` Capped at ${confidenceCap}: ${lineupNote ?? "lineup context is uncertain."}` : ""
          }`,
        },
        {
          key: "risk",
          label: "Risk",
          grade: "Incomplete",
          weightPct: weights.risk,
          note: "No risk model yet — lineup, pitch-count, and volatility checks land in a later phase.",
        },
      ];

      // Overall grade: weighted blend of every category that has real
      // data behind it, using the user's configured weights. Incomplete
      // categories are excluded rather than faked.
      const overallGrade = blendGrades(categories.map((c) => ({ grade: c.grade, weightPct: c.weightPct })));

      // Integrity flag: a player-prop consensus merged across providers
      // may mix settlement rules — surface it instead of trusting it.
      const crossProvider =
        best.quote.playerName != null && new Set(quotes.map((q) => q.source)).size > 1;

      // Movement for the surfaced book across stored snapshots.
      const bookHistory = historyRows.filter(
        (r) =>
          r.eventId === best.quote.eventId &&
          r.marketType === best.quote.marketType &&
          r.marketPeriod === best.quote.marketPeriod &&
          bookKey(r) === book &&
          (r.playerName ? normalizePlayerKey(r.playerName) : "") ===
            (best.quote.playerName ? normalizePlayerKey(best.quote.playerName) : ""),
      );
      const movement = describeMovement(bookHistory.concat(best.quote), side);

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
        consensus: sideConsensus,
        edgePts: Number(best.edgePts.toFixed(1)),
        sideFairProb: fairForSide,
        grade: overallGrade,
        gradeLabel: overallGrade,
        categories,
        recentForm,
        summary: `${bookName} requires this pick to win about ${(best.breakEven * 100).toFixed(0)}% of the time to break even. The broader market estimates a ${(fairForSide * 100).toFixed(0)}% chance. The estimated difference is about ${best.edgePts.toFixed(1)} percentage points.`,
        whyItGradesWell: [
          `${consensus.sourceCount} sportsbooks were compared, with each book's vig removed separately before taking the median.`,
          `${bookName} posts the best available price on the ${sideLabel} side of this market.`,
          ...whyContext,
          ...(verified ? [`${verified.label}.`] : []),
          ...(trend
            ? [`Your uploaded trend agrees: ${trendSignals.map((s) => s.label).join("; ") || trend.market}.`]
            : []),
        ],
        whatCouldGoWrong: [
          "Odds on this data plan are about 10 minutes delayed; the live price may have moved.",
          trend
            ? "Trend samples are small (last-N games). They show direction, not proof — streaks end."
            : "Matchup, lineup, and weather context is not analyzed yet — this is a price-only signal.",
          `${playerPart ? "A lineup change or early exit could void the assumptions behind this line." : "Game conditions can shift totals quickly."}`,
          ...(isMoneyline && best.odds >= -120
            ? ["Journal reminder: dog/near-even moneylines are your least successful logged bet shape."]
            : []),
          ...(crossProvider
            ? ["This market was matched across two data providers — verify the books use the same settlement rules before trusting the edge."]
            : []),
          ...(movement.worsened
            ? ["The price has drifted worse for this side since earlier snapshots — the book may be correcting toward the market."]
            : []),
          ...riskContext,
          ...(storedWeather &&
          storedWeather.roof !== "fixed" &&
          storedWeather.rainProbPct != null &&
          storedWeather.rainProbPct >= 40 &&
          statGroup === "pitching"
            ? [`Rain chance is ${storedWeather.rainProbPct}% — a delay or early exit is a real risk for pitcher props.`]
            : []),
          `${consensus.sourceCount} sources is not ${consensus.sourceCount} independent opinions — US retail books often mirror each other's prices.`,
        ],
        bottomLine: `The available line appears favorable against the ${consensus.sourceCount}-book market estimate. Treat it as provisional until matchup analysis is added.`,
        dataConfidence: dGrade === "A" ? "high" : dGrade === "B" ? "medium" : "low",
        dataConfidenceNote: `${consensus.sourceCount} books, ${disagreement} disagreement, collected ${consensus.lastUpdated}. Provider odds are ~10 minutes delayed on the current plan.`,
        freshness,
        lastUpdated: consensus.lastUpdated,
        lineMovement: `${bookName}: ${movement.text}`,
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
        matchNeedsReview: crossProvider || contextReviewFlag,
        weather: weatherInfo,
        lineupStatus,
        lineupNote,
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

async function getLatestRowsAndEvents(): Promise<{
  rows: MarketRecord[];
  eventById: Map<number, Event>;
  historyRows: MarketRecord[];
} | null> {
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

  // Snapshot history for line movement: earlier collection runs from the
  // last 24 hours for the same events. Every run is a stored snapshot.
  const idSet = new Set(eventIds);
  const historyCutoff = new Date(newest[0].retrievedAt.getTime() - 24 * 60 * 60 * 1000);
  const history = await db.select().from(marketRecords).where(gt(marketRecords.retrievedAt, historyCutoff));
  const historyRows = history.filter((r) => r.eventId != null && idSet.has(r.eventId));

  return { rows, eventById, historyRows };
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
  // Today's uploaded trends enrich the grading; a missing table (fresh
  // deploy before migration) must not break the feed.
  let dayTrends: Trend[] = [];
  try {
    dayTrends = await listTrends(todayEt());
  } catch {
    dayTrends = [];
  }
  const weights = await getGradeWeights();
  // MLB context (probables/lineups/game logs) — absent tables or a fresh
  // deploy must never break the feed.
  let contexts: GameContext[] = [];
  let playerLogs: PlayerGameLog[] = [];
  try {
    const ctx = await loadContext();
    contexts = ctx.contexts;
    playerLogs = ctx.logs;
  } catch {
    contexts = [];
    playerLogs = [];
  }
  const opportunities = buildOpportunities(latest.rows, latest.eventById, new Date(), myBookmakers(), {
    dayTrends,
    weights,
    historyRows: latest.historyRows,
    contexts,
    playerLogs,
  });
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
    if (row.isLive) continue; // pregame only — see buildOpportunities
    const key = [
      row.eventId,
      row.marketType,
      row.playerName ? normalizePlayerKey(row.playerName) : "",
      row.line ?? "",
      row.marketPeriod,
    ].join("|");
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
