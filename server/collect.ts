/**
 * MLB data collection from SportsGameOdds into PostgreSQL.
 *
 * Quota-frugal by design: one API request per run, a configurable event
 * limit (ODDS_EVENTS_LIMIT, default 3), and only whitelisted markets are
 * stored. Runs are recorded in audit_log. Old records are kept — history
 * is part of the spec — and readers select the newest batch.
 */
import { and, eq } from "drizzle-orm";
import { auditLog, events, marketRecords } from "@shared/schema";
import { getDb, isDbConfigured } from "./db";
import { parseSgoEvents, type ParsedEvent } from "./markets";

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

async function upsertEvent(parsed: ParsedEvent): Promise<number> {
  const db = getDb();
  const existing = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.sport, "mlb"), eq(events.homeTeam, parsed.homeTeam), eq(events.startTime, parsed.startTime)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(events).set({ status: parsed.status }).where(eq(events.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db
    .insert(events)
    .values({
      sport: "mlb",
      league: "MLB",
      startTime: parsed.startTime,
      timezone: "UTC",
      homeTeam: parsed.homeTeam,
      awayTeam: parsed.awayTeam,
      status: parsed.status,
    })
    .returning({ id: events.id });
  return inserted[0].id;
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
    const eventId = await upsertEvent(parsed);
    for (const [stat, count] of Object.entries(parsed.skippedStatIds)) {
      skippedStatIds[stat] = (skippedStatIds[stat] ?? 0) + count;
    }
    const values = parsed.rows
      .filter((row) => row.overOdds !== null && row.underOdds !== null)
      .map((row) => ({
        source: SOURCE,
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
        // Free-tier odds are ~10 minutes delayed at the provider.
        freshness: "delayed",
      }));
    if (values.length > 0) {
      await db.insert(marketRecords).values(values);
      rowsStored += values.length;
    }
  }

  const message = `Collected ${rowsStored} market rows from ${parsedEvents.length} MLB event(s).`;
  await safeAudit("job", message, { rowsStored, events: parsedEvents.length, skippedStatIds });
  return {
    ok: true,
    message,
    apiStatus: status,
    eventsSeen: parsedEvents.length,
    rowsStored,
    skippedStatIds,
    ranAt,
  };
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
