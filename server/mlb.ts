/**
 * MLB game context from the free MLB Stats API (statsapi.mlb.com — no key
 * required): probable pitchers, confirmed lineups, and per-player game
 * logs. This is verified league data, distinct from user-uploaded trend
 * screenshots. Fetch + store live here; the pure helpers that grading
 * uses (verifiedForm, statValueForMarket) are exported for tests.
 */
import { and, desc, eq, gt } from "drizzle-orm";
import { events, gameContext, playerGameLogs, marketRecords, type GameContext, type PlayerGameLog } from "@shared/schema";
import { getDb, isDbConfigured } from "./db";
import { normalizePlayerKey } from "./markets";
import { todayEt } from "./trends";
import { fetchStadiumForecast, stadiumForTeam, type StoredWeather } from "./weather";

const API = "https://statsapi.mlb.com/api/v1";

export interface LineupSlot {
  id: number;
  fullName: string;
  order?: number;
}

export interface ProbablePitcher {
  id: number;
  fullName: string;
}

export interface GameLogEntry {
  date: string;
  stats: Record<string, unknown>;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MLB Stats API ${res.status} for ${url}`);
  return res.json();
}

function teamNamesMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Markets that describe a batter (hitting game logs apply). */
export const HITTING_MARKETS = new Set([
  "Hits",
  "Total bases",
  "Home runs",
  "RBIs",
  "Batter walks",
  "Stolen bases",
  "Batter strikeouts",
]);

/** Markets that describe a pitcher (pitching game logs apply). */
export const PITCHING_MARKETS = new Set([
  "Pitcher strikeouts",
  "Pitcher outs recorded",
  "Earned runs allowed",
  "Pitcher walks",
  "Hits allowed",
]);

export function statGroupForMarket(marketType: string): "hitting" | "pitching" | null {
  if (HITTING_MARKETS.has(marketType)) return "hitting";
  if (PITCHING_MARKETS.has(marketType)) return "pitching";
  return null;
}

/** "6.1" innings-pitched notation → 19 outs (thirds, not tenths). */
export function outsFromInnings(ip: unknown): number | null {
  if (typeof ip !== "string" && typeof ip !== "number") return null;
  const str = String(ip);
  const m = /^(\d+)(?:\.([0-2]))?$/.exec(str);
  if (!m) return null;
  return Number(m[1]) * 3 + (m[2] ? Number(m[2]) : 0);
}

/** Extract the stat that settles a market from one game-log entry. */
export function statValueForMarket(marketType: string, stats: Record<string, unknown>): number | null {
  const num = (key: string): number | null => {
    const v = stats[key];
    return typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
  };
  switch (marketType) {
    case "Hits":
      return num("hits");
    case "Total bases":
      return num("totalBases");
    case "Home runs":
      return num("homeRuns");
    case "RBIs":
      return num("rbi");
    case "Batter walks":
      return num("baseOnBalls");
    case "Stolen bases":
      return num("stolenBases");
    case "Batter strikeouts":
      return num("strikeOuts");
    case "Pitcher strikeouts":
      return num("strikeOuts");
    case "Earned runs allowed":
      return num("earnedRuns");
    case "Pitcher walks":
      return num("baseOnBalls");
    case "Hits allowed":
      return num("hits");
    case "Pitcher outs recorded":
      return outsFromInnings(stats["inningsPitched"]);
    default:
      return null;
  }
}

/**
 * Verified recent form: how often the player's actual game logs cleared
 * (Over) or stayed under (Under) the offered line, over the last N games.
 */
export function verifiedForm(
  logs: GameLogEntry[],
  marketType: string,
  side: "over" | "under",
  line: number,
  lastN = 10,
): { label: string; hits: number; total: number } | null {
  const recent = logs.slice(-lastN);
  let hits = 0;
  let total = 0;
  for (const entry of recent) {
    const value = statValueForMarket(marketType, entry.stats ?? {});
    if (value == null) continue;
    total += 1;
    if (side === "over" ? value > line : value < line) hits += 1;
  }
  if (total < 3) return null; // too few settled games to say anything
  const word = side === "over" ? "Over" : "Under";
  return { label: `${word} ${line} in ${hits} of last ${total} games (verified game logs)`, hits, total };
}

// ---- Fetch + store ----

interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  homeName: string;
  awayName: string;
  homeProbable: ProbablePitcher | null;
  awayProbable: ProbablePitcher | null;
  homeLineup: LineupSlot[];
  awayLineup: LineupSlot[];
}

function parsePerson(raw: unknown): ProbablePitcher | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "number" || typeof p.fullName !== "string") return null;
  return { id: p.id, fullName: p.fullName };
}

function parseLineup(raw: unknown): LineupSlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: LineupSlot[] = [];
  raw.forEach((entry, i) => {
    const person = parsePerson(entry);
    if (person) slots.push({ ...person, order: i + 1 });
  });
  return slots;
}

function parseSchedule(raw: unknown): ScheduleGame[] {
  const out: ScheduleGame[] = [];
  const dates = (raw as { dates?: unknown[] })?.dates;
  if (!Array.isArray(dates)) return out;
  for (const date of dates) {
    const games = (date as { games?: unknown[] })?.games;
    if (!Array.isArray(games)) continue;
    for (const g of games) {
      const game = g as Record<string, unknown>;
      const teams = game.teams as Record<string, Record<string, unknown>> | undefined;
      const home = teams?.home;
      const away = teams?.away;
      const homeTeam = (home?.team as Record<string, unknown>)?.name;
      const awayTeam = (away?.team as Record<string, unknown>)?.name;
      if (typeof game.gamePk !== "number" || typeof homeTeam !== "string" || typeof awayTeam !== "string") continue;
      const lineups = game.lineups as Record<string, unknown> | undefined;
      out.push({
        gamePk: game.gamePk,
        gameDate: typeof game.gameDate === "string" ? game.gameDate : "",
        homeName: homeTeam,
        awayName: awayTeam,
        homeProbable: parsePerson(home?.probablePitcher),
        awayProbable: parsePerson(away?.probablePitcher),
        homeLineup: parseLineup(lineups?.homePlayers),
        awayLineup: parseLineup(lineups?.awayPlayers),
      });
    }
  }
  return out;
}

function parseGameLog(raw: unknown): GameLogEntry[] {
  const stats = (raw as { stats?: unknown[] })?.stats;
  if (!Array.isArray(stats)) return [];
  for (const block of stats) {
    const splits = (block as { splits?: unknown[] })?.splits;
    if (!Array.isArray(splits)) continue;
    const entries: GameLogEntry[] = [];
    for (const split of splits) {
      const s = split as Record<string, unknown>;
      if (typeof s.date !== "string" || !s.stat || typeof s.stat !== "object") continue;
      entries.push({ date: s.date, stats: s.stat as Record<string, unknown> });
    }
    if (entries.length > 0) {
      entries.sort((a, b) => a.date.localeCompare(b.date));
      return entries;
    }
  }
  return [];
}

export interface ContextSummary {
  ok: boolean;
  message: string;
  gamesMatched: number;
  lineupsPosted: number;
  playersLogged: number;
}

export function mlbContextEnabled(): boolean {
  return process.env.MLB_CONTEXT !== "0";
}

/**
 * Refresh MLB context: match today's schedule to stored events, capture
 * probables + lineups, and pull game logs for players present in the
 * newest market batch (capped to limit API calls).
 */
export async function refreshMlbContext(): Promise<ContextSummary> {
  if (!isDbConfigured()) {
    return { ok: false, message: "Database not configured", gamesMatched: 0, lineupsPosted: 0, playersLogged: 0 };
  }
  const db = getDb();
  const date = todayEt();
  const season = date.slice(0, 4);

  const schedule = parseSchedule(
    await fetchJson(`${API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,lineups`),
  );

  // Events starting within the next ~36 hours.
  const upcoming = await db
    .select()
    .from(events)
    .where(gt(events.startTime, new Date(Date.now() - 6 * 3600 * 1000)));

  let gamesMatched = 0;
  let lineupsPosted = 0;
  let forecasts = 0;
  const matchedByEvent = new Map<number, ScheduleGame>();
  const weatherCache = new Map<string, StoredWeather | null>();
  for (const event of upcoming) {
    const game = schedule.find(
      (g) => teamNamesMatch(g.homeName, event.homeTeam) && teamNamesMatch(g.awayName, event.awayTeam),
    );
    if (!game) continue;
    gamesMatched += 1;
    if (game.homeLineup.length > 0 || game.awayLineup.length > 0) lineupsPosted += 1;
    matchedByEvent.set(event.id, game);

    // NWS forecast at first pitch (best-effort; one lookup per stadium).
    let weather: StoredWeather | null = null;
    const stadium = stadiumForTeam(event.homeTeam);
    if (stadium) {
      if (weatherCache.has(stadium.venue)) {
        weather = weatherCache.get(stadium.venue) ?? null;
      } else {
        try {
          weather = await fetchStadiumForecast(stadium, event.startTime);
        } catch {
          weather = null;
        }
        weatherCache.set(stadium.venue, weather);
      }
      if (weather) forecasts += 1;
    }

    await db
      .insert(gameContext)
      .values({
        eventId: event.id,
        gamePk: game.gamePk,
        gameDate: date,
        homeProbable: game.homeProbable,
        awayProbable: game.awayProbable,
        homeLineup: game.homeLineup,
        awayLineup: game.awayLineup,
        weather,
        capturedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: gameContext.eventId,
        set: {
          gamePk: game.gamePk,
          gameDate: date,
          homeProbable: game.homeProbable,
          awayProbable: game.awayProbable,
          homeLineup: game.homeLineup,
          awayLineup: game.awayLineup,
          weather,
          capturedAt: new Date(),
        },
      });
  }

  // Player universe: everyone the context knows about (lineups + probables),
  // filtered to players actually present in the newest market batch.
  const newest = await db
    .select({ retrievedAt: marketRecords.retrievedAt })
    .from(marketRecords)
    .orderBy(desc(marketRecords.retrievedAt))
    .limit(1);
  const marketPlayerKeys = new Set<string>();
  if (newest.length > 0) {
    const cutoff = new Date(newest[0].retrievedAt.getTime() - 5 * 60 * 1000);
    const batch = await db
      .select({ playerName: marketRecords.playerName })
      .from(marketRecords)
      .where(gt(marketRecords.retrievedAt, cutoff));
    for (const row of batch) {
      if (row.playerName) marketPlayerKeys.add(normalizePlayerKey(row.playerName));
    }
  }

  const candidates: { id: number; key: string; group: "hitting" | "pitching" }[] = [];
  const seen = new Set<string>();
  for (const game of Array.from(matchedByEvent.values())) {
    for (const p of [game.homeProbable, game.awayProbable]) {
      if (!p) continue;
      const key = normalizePlayerKey(p.fullName);
      if (!seen.has(`${key}|pitching`)) {
        seen.add(`${key}|pitching`);
        candidates.push({ id: p.id, key, group: "pitching" });
      }
    }
    for (const slot of [...game.homeLineup, ...game.awayLineup]) {
      const key = normalizePlayerKey(slot.fullName);
      if (!seen.has(`${key}|hitting`)) {
        seen.add(`${key}|hitting`);
        candidates.push({ id: slot.id, key, group: "hitting" });
      }
    }
  }
  const wanted = candidates.filter((c) => marketPlayerKeys.size === 0 || marketPlayerKeys.has(c.key)).slice(0, 40);

  let playersLogged = 0;
  for (const player of wanted) {
    try {
      const raw = await fetchJson(
        `${API}/people/${player.id}/stats?stats=gameLog&group=${player.group}&season=${season}`,
      );
      const logs = parseGameLog(raw);
      if (logs.length === 0) continue;
      await db
        .delete(playerGameLogs)
        .where(and(eq(playerGameLogs.playerId, player.id), eq(playerGameLogs.statGroup, player.group)));
      await db.insert(playerGameLogs).values({
        playerId: player.id,
        playerKey: player.key,
        statGroup: player.group,
        season,
        logs,
        capturedAt: new Date(),
      });
      playersLogged += 1;
    } catch {
      // one player failing must not sink the run
    }
  }

  return {
    ok: true,
    message: `MLB context: matched ${gamesMatched} game(s), lineups posted for ${lineupsPosted}, weather for ${forecasts}, game logs stored for ${playersLogged} player(s).`,
    gamesMatched,
    lineupsPosted,
    playersLogged,
  };
}

export async function loadContext(): Promise<{ contexts: GameContext[]; logs: PlayerGameLog[] }> {
  if (!isDbConfigured()) return { contexts: [], logs: [] };
  const db = getDb();
  const contexts = await db.select().from(gameContext);
  const logs = await db.select().from(playerGameLogs);
  return { contexts, logs };
}
