/**
 * MLB data collection from SportsGameOdds into PostgreSQL.
 *
 * Quota-frugal by design: one API request per run, a configurable event
 * limit (ODDS_EVENTS_LIMIT, default 3), and only whitelisted markets are
 * stored. Runs are recorded in audit_log. Old records are kept — history
 * is part of the spec — and readers select the newest batch.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { auditLog, events, marketRecords } from "@shared/schema";
import { getDb, isDbConfigured } from "./db";
import { parseOddsApiEvents, parseSgoEvents, type ParsedEvent, type ParsedMarketRow } from "./markets";
import { findOddsApiKey } from "./providers/theoddsapi";

const BASE = "https://api.sportsgameodds.com";
const SOURCE = "sportsgameodds";

export interface CollectionSummary {
  ok: boolean;
  message: string;
  apiStatus: number | null;
  eventsSeen: number;
  rowsStored: number;
  skippedStatIds: Record<string, number>;
  ranAt: string;
}

export function collectionConfigured(): { ok: boolean; reason?: string } {
  if (!process.env.SPORTSGAMEODDS_API_KEY) {
    return { ok: false, reason: "SPORTSGAMEODDS_API_KEY is not set" };
  }
  if (!isDbConfigured()) {
    return { ok: false, reason: "DATABASE_URL is not set" };
  }
  return { ok: true };
}

async function fetchEvents(limit: number): Promise<{ status: number | null; body: string }> {
  const url = new URL(`/v2/events/?leagueID=MLB&oddsAvailable=true&limit=${limit}`, BASE);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Api-Key": process.env.SPORTSGAMEODDS_API_KEY! },
      signal: AbortSignal.timeout(25000),
    });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: null, body: `NETWORK ERROR: ${String(error)}` };
  }
}

/**
 * Find-or-create the internal event. Matched on home team plus a ±2 hour
 * start-time window so records from different providers (whose timestamps
 * can differ by minutes) land on the same internal event.
 */
async function upsertEvent(homeTeam: string, awayTeam: string, startTime: Date, status: string): Promise<number> {
  const db = getDb();
  const windowStart = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
  const windowEnd = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const existing = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.sport, "mlb"),
        eq(events.homeTeam, homeTeam),
        gte(events.startTime, windowStart),
        lte(events.startTime, windowEnd),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    if (status !== "scheduled") {
      await db.update(events).set({ status }).where(eq(events.id, existing[0].id));
    }
    return existing[0].id;
  }
  const inserted = await db
    .insert(events)
    .values({
      sport: "mlb",
      league: "MLB",
      startTime,
      timezone: "UTC",
      homeTeam,
      awayTeam,
      status,
    })
    .returning({ id: events.id });
  return inserted[0].id;
}

async function storeRows(source: string, eventId: number, rows: ParsedMarketRow[], retrievedAt: Date): Promise<number> {
  const db = getDb();
  const values = rows
    .filter((row) => row.overOdds !== null && row.underOdds !== null)
    .map((row) => ({
      source,
      bookmaker: row.bookmaker,
      sourceEventId: row.sourceEventId,
      eventId,
      playerName: row.playerName,
      playerId: row.playerId,
      marketType: row.marketType,
      marketPeriod: row.marketPeriod,
      line: row.line,
      overOdds: row.overOdds,
      underOdds: row.underOdds,
      isLive: row.isLive,
      retrievedAt,
      changedAt: retrievedAt,
      sourceStatus: "ok",
      freshness: "delayed",
    }));
  if (values.length > 0) {
    await db.insert(marketRecords).values(values);
  }
  return values.length;
}

export async function runCollection(): Promise<CollectionSummary> {
  const ranAt = new Date().toISOString();
  const configured = collectionConfigured();
  if (!configured.ok) {
    return {
      ok: false,
      message: `Collection not configured: ${configured.reason}`,
      apiStatus: null,
      eventsSeen: 0,
      rowsStored: 0,
      skippedStatIds: {},
      ranAt,
    };
  }

  const limit = Math.max(1, Math.min(10, Number(process.env.ODDS_EVENTS_LIMIT ?? 3)));
  const { status, body } = await fetchEvents(limit);
  if (status !== 200) {
    const message = `Provider request failed (status ${status}): ${body.slice(0, 300)}`;
    await safeAudit("data-quality", message, { status });
    return { ok: false, message, apiStatus: status, eventsSeen: 0, rowsStored: 0, skippedStatIds: {}, ranAt };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    const message = "Provider response was not JSON.";
    await safeAudit("data-quality", message, { sample: body.slice(0, 300) });
    return { ok: false, message, apiStatus: status, eventsSeen: 0, rowsStored: 0, skippedStatIds: {}, ranAt };
  }

  const parsedEvents = parseSgoEvents(payload);
  const db = getDb();
  const retrievedAt = new Date();
  let rowsStored = 0;
  const skippedStatIds: Record<string, number> = {};

  for (const parsed of parsedEvents) {
    const eventId = await upsertEvent(parsed.homeTeam, parsed.awayTeam, parsed.startTime, parsed.status);
    for (const [stat, count] of Object.entries(parsed.skippedStatIds)) {
      skippedStatIds[stat] = (skippedStatIds[stat] ?? 0) + count;
    }
    rowsStored += await storeRows(SOURCE, eventId, parsed.rows, retrievedAt);
  }

  // Source #2: The Odds API — Hard Rock Bet et al. Runs when a key exists.
  const oddsApi = await runOddsApiCollection(retrievedAt);

  const message = `Collected ${rowsStored} rows from ${parsedEvents.length} MLB event(s) via SportsGameOdds${
    oddsApi ? `; ${oddsApi.rows} rows from ${oddsApi.events} event(s) via The Odds API (credits left: ${oddsApi.creditsRemaining ?? "?"})` : ""
  }.`;
  await safeAudit("job", message, { rowsStored, events: parsedEvents.length, skippedStatIds, oddsApi });
  return {
    ok: true,
    message,
    apiStatus: status,
    eventsSeen: parsedEvents.length + (oddsApi?.events ?? 0),
    rowsStored: rowsStored + (oddsApi?.rows ?? 0),
    skippedStatIds,
    ranAt,
  };
}

const ODDSAPI_BASE = "https://api.the-odds-api.com";

async function oddsApiFetch(path: string, key: string): Promise<{ status: number | null; body: string; remaining: string | null }> {
  const url = new URL(path, ODDSAPI_BASE);
  url.searchParams.set("apiKey", key);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    return { status: res.status, body: await res.text(), remaining: res.headers.get("x-requests-remaining") };
  } catch (error) {
    return { status: null, body: String(error), remaining: null };
  }
}

/**
 * Collect from The Odds API: game totals for all upcoming events (2
 * credits), then player props for the next ODDSAPI_EVENTS_LIMIT pregame
 * events (6 credits each: 3 markets x 2 regions). Returns null when no
 * key is configured.
 */
async function runOddsApiCollection(retrievedAt: Date): Promise<{ rows: number; events: number; creditsRemaining: string | null } | null> {
  const key = findOddsApiKey()?.key;
  if (!key) return null;

  let rows = 0;
  let eventCount = 0;
  let creditsRemaining: string | null = null;

  const totals = await oddsApiFetch("/v4/sports/baseball_mlb/odds/?regions=us,us2&markets=h2h,totals&oddsFormat=american", key);
  creditsRemaining = totals.remaining ?? creditsRemaining;
  if (totals.status !== 200) {
    await safeAudit("data-quality", `The Odds API totals request failed (${totals.status})`, { sample: totals.body.slice(0, 300) });
    return { rows: 0, events: 0, creditsRemaining };
  }
  let parsedList: ReturnType<typeof parseOddsApiEvents> = [];
  try {
    parsedList = parseOddsApiEvents(JSON.parse(totals.body) as unknown[]);
  } catch {
    await safeAudit("data-quality", "The Odds API totals response was not JSON", {});
    return { rows: 0, events: 0, creditsRemaining };
  }

  const propLimit = Math.max(0, Math.min(4, Number(process.env.ODDSAPI_EVENTS_LIMIT ?? 2)));
  const upcoming = parsedList.filter((e) => e.startTime.getTime() > Date.now());

  for (const parsed of parsedList) {
    if (parsed.rows.length === 0) continue;
    const eventId = await upsertEvent(parsed.homeTeam, parsed.awayTeam, parsed.startTime, "scheduled");
    rows += await storeRows("theoddsapi", eventId, parsed.rows, retrievedAt);
    eventCount++;
  }

  for (const target of upcoming.slice(0, propLimit)) {
    const props = await oddsApiFetch(
      `/v4/sports/baseball_mlb/events/${target.sourceEventId}/odds/?regions=us,us2&markets=pitcher_strikeouts,batter_total_bases,batter_hits&oddsFormat=american`,
      key,
    );
    creditsRemaining = props.remaining ?? creditsRemaining;
    if (props.status !== 200) continue;
    try {
      const parsedProps = parseOddsApiEvents([JSON.parse(props.body)]);
      for (const parsed of parsedProps) {
        if (parsed.rows.length === 0) continue;
        const eventId = await upsertEvent(parsed.homeTeam, parsed.awayTeam, parsed.startTime, "scheduled");
        rows += await storeRows("theoddsapi", eventId, parsed.rows, retrievedAt);
      }
    } catch {
      // skip malformed prop payloads
    }
  }

  return { rows, events: eventCount, creditsRemaining };
}

/** Raw preview of one event's odds for parser debugging. One API request. */
export async function previewRaw(): Promise<unknown> {
  if (!process.env.SPORTSGAMEODDS_API_KEY) {
    return { error: "SPORTSGAMEODDS_API_KEY is not set" };
  }
  const { status, body } = await fetchEvents(1);
  if (status !== 200) return { status, sample: body.slice(0, 500) };
  try {
    const payload = JSON.parse(body) as { data?: { eventID?: string; odds?: Record<string, unknown> }[] };
    const event = payload.data?.[0];
    const oddsEntries = Object.entries(event?.odds ?? {}).slice(0, 3);
    return {
      status,
      eventID: event?.eventID,
      firstThreeOdds: Object.fromEntries(oddsEntries),
      parsedRowSample: parseSgoEvents(payload)[0]?.rows.slice(0, 5) ?? [],
    };
  } catch (error) {
    return { status, error: String(error) };
  }
}

async function safeAudit(category: string, message: string, data: unknown): Promise<void> {
  try {
    if (isDbConfigured()) {
      await getDb().insert(auditLog).values({ category, message, data });
    }
  } catch (error) {
    console.error("[collect] audit write failed:", error);
  }
}
