/**
 * Market normalization for SportsGameOdds payloads.
 *
 * Parses the v2 events response (odds keyed by
 * "{statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}", with a
 * byBookmaker map of { odds, overUnder, ... } per book) into flat,
 * book-level market rows ready for storage. Only whitelisted markets are
 * kept; anything unrecognized is counted, never guessed at.
 */

/** MLB markets we collect, keyed by SGO statID. */
export const MLB_STAT_MAP: Record<string, string> = {
  pitching_strikeouts: "Pitcher strikeouts",
  pitching_outs: "Pitcher outs recorded",
  pitching_earnedRuns: "Earned runs allowed",
  pitching_hits: "Hits allowed",
  pitching_basesOnBalls: "Pitcher walks",
  batting_hits: "Hits",
  batting_totalBases: "Total bases",
  batting_homeRuns: "Home runs",
  batting_RBI: "RBIs",
  batting_basesOnBalls: "Batter walks",
  batting_stolenBases: "Stolen bases",
  batting_strikeouts: "Batter strikeouts",
  points: "Game total points",
};

export interface ParsedMarketRow {
  sourceEventId: string;
  marketType: string;
  marketPeriod: string;
  playerName: string | null;
  playerId: string | null;
  bookmaker: string;
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
  isLive: boolean;
}

export interface ParsedEvent {
  sourceEventId: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  status: string;
  isLive: boolean;
  rows: ParsedMarketRow[];
  skippedStatIds: Record<string, number>;
}

/** "JOSE_RAMIREZ_1_MLB" -> "Jose Ramirez". Team/side entities return null. */
export function humanizePlayerId(statEntityID: string): string | null {
  if (["home", "away", "all", "side1", "side2"].includes(statEntityID)) return null;
  const parts = statEntityID.split("_").filter((p) => !/^\d+$/.test(p) && p !== "MLB");
  if (parts.length === 0) return null;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/^\+/, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface OddEntry {
  statID?: string;
  statEntityID?: string;
  periodID?: string;
  betTypeID?: string;
  sideID?: string;
  byBookmaker?: Record<string, { odds?: unknown; overUnder?: unknown; available?: unknown }>;
}

interface SgoEvent {
  eventID?: string;
  teams?: {
    home?: { names?: { long?: string; medium?: string; short?: string } };
    away?: { names?: { long?: string; medium?: string; short?: string } };
  };
  status?: { startsAt?: string; live?: boolean; started?: boolean; completed?: boolean; displayShort?: string };
  odds?: Record<string, OddEntry>;
}

export function parseSgoEvents(payload: unknown): ParsedEvent[] {
  const data = ((payload as { data?: unknown[] })?.data ?? []) as SgoEvent[];
  const events: ParsedEvent[] = [];

  for (const event of data) {
    if (!event.eventID) continue;
    const home = event.teams?.home?.names?.long ?? event.teams?.home?.names?.medium ?? "Home";
    const away = event.teams?.away?.names?.long ?? event.teams?.away?.names?.medium ?? "Away";
    const startTime = event.status?.startsAt ? new Date(event.status.startsAt) : new Date();
    const isLive = event.status?.live === true;
    const status = event.status?.completed
      ? "completed"
      : isLive
        ? "live"
        : "scheduled";

    // Group over/under pairs per (stat, entity, period) then per bookmaker.
    type Group = Map<string, { over?: { odds: number | null; line: number | null }; under?: { odds: number | null; line: number | null } }>;
    const groups = new Map<string, { statID: string; statEntityID: string; periodID: string; books: Group }>();
    const skipped: Record<string, number> = {};

    for (const [oddId, odd] of Object.entries(event.odds ?? {})) {
      const statID = odd.statID ?? oddId.split("-")[0];
      const marketType = MLB_STAT_MAP[statID];
      if (!marketType) {
        skipped[statID] = (skipped[statID] ?? 0) + 1;
        continue;
      }
      const betTypeID = odd.betTypeID ?? "";
      const sideID = odd.sideID ?? "";
      if (betTypeID !== "ou" || (sideID !== "over" && sideID !== "under")) {
        skipped[`${statID}:${betTypeID}`] = (skipped[`${statID}:${betTypeID}`] ?? 0) + 1;
        continue;
      }
      const statEntityID = odd.statEntityID ?? "all";
      const periodID = odd.periodID ?? "game";
      const groupKey = `${statID}|${statEntityID}|${periodID}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { statID, statEntityID, periodID, books: new Map() });
      }
      const group = groups.get(groupKey)!;
      for (const [book, quote] of Object.entries(odd.byBookmaker ?? {})) {
        if (!group.books.has(book)) group.books.set(book, {});
        const entry = group.books.get(book)!;
        const parsedQuote = { odds: toNumber(quote.odds), line: toNumber(quote.overUnder) };
        if (sideID === "over") entry.over = parsedQuote;
        else entry.under = parsedQuote;
      }
    }

    const rows: ParsedMarketRow[] = [];
    for (const group of Array.from(groups.values())) {
      const playerName = humanizePlayerId(group.statEntityID);
      for (const [book, sides] of Array.from(group.books.entries())) {
        const line = sides.over?.line ?? sides.under?.line ?? null;
        // Only keep quotes where both sides share the same line (or one side
        // is missing a line but the other has it). Mismatched lines are not
        // comparable — the spec forbids pretending they are.
        if (
          sides.over?.line != null &&
          sides.under?.line != null &&
          sides.over.line !== sides.under.line
        ) {
          continue;
        }
        rows.push({
          sourceEventId: event.eventID,
          marketType: MLB_STAT_MAP[group.statID],
          marketPeriod: group.periodID,
          playerName,
          playerId: playerName ? group.statEntityID : null,
          bookmaker: book,
          line,
          overOdds: sides.over?.odds ?? null,
          underOdds: sides.under?.odds ?? null,
          isLive,
        });
      }
    }

    events.push({
      sourceEventId: event.eventID,
      homeTeam: home,
      awayTeam: away,
      startTime,
      status,
      isLive,
      rows,
      skippedStatIds: skipped,
    });
  }

  return events;
}
