/**
 * SportsGameOdds provider verification (battery v2).
 *
 * v1 findings (2026-07-21): header auth works; sports list includes
 * baseball/tennis/basketball; leagues include MLB and NCAAB (no ATP/WTA
 * strings); /v2/bookmakers/ does not exist (404); MLB events carry player
 * props and live data, but the free tier withholds many bookmaker odds
 * ("upgrade" notice in payload).
 *
 * v2 therefore parses odds payloads server-side and reports: the actual
 * bookmaker IDs present in odds objects, the market/stat types offered,
 * plan-limit notices, and tennis + NCAAB probes. At most 5 provider
 * requests per run (free tier allows 10/min).
 *
 * The API key comes from SPORTSGAMEODDS_API_KEY and is never echoed.
 */

const BASE = "https://api.sportsgameodds.com";

export interface CheckResult {
  check: string;
  path: string;
  status: number | null;
  ok: boolean;
  summary: string;
  detail: Record<string, unknown>;
}

export interface ProviderCheckReport {
  provider: "sportsgameodds";
  configured: boolean;
  ranAt: string;
  results: CheckResult[];
  note: string;
}

async function call(path: string, key: string): Promise<{ status: number | null; body: string }> {
  try {
    const res = await fetch(new URL(path, BASE), {
      headers: { Accept: "application/json", "X-Api-Key": key },
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: null, body: `NETWORK ERROR: ${String(error)}` };
  }
}

function tryParse(body: string): unknown | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Walk a parsed payload collecting bookmaker IDs (keys of byBookmaker objects). */
function collectBookmakers(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectBookmakers(item, found);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "byBookmaker" && value && typeof value === "object") {
        for (const book of Object.keys(value as Record<string, unknown>)) found.add(book);
      }
      collectBookmakers(value, found);
    }
  }
}

/** Collect notices (plan-limit messages) anywhere in the payload. */
function collectNotices(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNotices(item, found);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "notice" && typeof value === "string") found.add(value);
      collectNotices(value, found);
    }
  }
}

/** Collect statIDs (first segment of oddID keys in event.odds objects). */
function collectStatIds(events: unknown[]): { statIds: string[]; oddsCount: number } {
  const statIds = new Set<string>();
  let oddsCount = 0;
  for (const event of events) {
    const odds = (event as { odds?: Record<string, unknown> }).odds;
    if (odds && typeof odds === "object") {
      for (const oddId of Object.keys(odds)) {
        oddsCount++;
        statIds.add(oddId.split("-")[0]);
      }
    }
  }
  return { statIds: Array.from(statIds).sort(), oddsCount };
}

function targetBooks(bookIds: Set<string>): string {
  const hits: string[] = [];
  for (const id of Array.from(bookIds)) {
    const lower = id.toLowerCase();
    if (lower.includes("hardrock") || lower.includes("hard_rock")) hits.push(`${id} (Hard Rock)`);
    if (lower.includes("prizepicks") || lower.includes("prize_picks")) hits.push(`${id} (PrizePicks)`);
    if (lower.includes("novig")) hits.push(`${id} (Novig)`);
  }
  return hits.length > 0 ? hits.join(", ") : "NONE of Hard Rock / PrizePicks / Novig";
}

function analyzeEvents(check: string, path: string, status: number | null, body: string): CheckResult {
  const parsed = tryParse(body);
  if (status !== 200 || !parsed) {
    return {
      check,
      path,
      status,
      ok: false,
      summary: "Request failed or response not JSON.",
      detail: { sample: body.slice(0, 600) },
    };
  }
  const data = (parsed as { data?: unknown[] }).data ?? [];
  const books = new Set<string>();
  const notices = new Set<string>();
  collectBookmakers(parsed, books);
  collectNotices(parsed, notices);
  const { statIds, oddsCount } = collectStatIds(data);
  const leagues = Array.from(
    new Set(data.map((e) => (e as { leagueID?: string }).leagueID).filter(Boolean)),
  );
  return {
    check,
    path,
    status,
    ok: true,
    summary: `${data.length} event(s), ${oddsCount} odds entries, ${books.size} bookmaker IDs. Target platforms: ${targetBooks(books)}`,
    detail: {
      leaguesSeen: leagues,
      bookmakerIds: Array.from(books).sort(),
      statIds,
      planNotices: Array.from(notices),
      liveDataMarkers: {
        hasScores: body.includes('"score"'),
        hasPeriods: body.includes("currentPeriodID"),
        mentionsFouls: body.toLowerCase().includes("foul"),
      },
    },
  };
}

export async function runSportsGameOddsCheck(): Promise<ProviderCheckReport> {
  const key = process.env.SPORTSGAMEODDS_API_KEY;
  const ranAt = new Date().toISOString();
  if (!key) {
    return {
      provider: "sportsgameodds",
      configured: false,
      ranAt,
      results: [],
      note: "SPORTSGAMEODDS_API_KEY is not set. Add it as an environment variable and redeploy.",
    };
  }

  const results: CheckResult[] = [];

  // 1. Leagues — full list this time, to find how tennis is keyed.
  const leagues = await call("/v2/leagues/", key);
  const leaguesParsed = tryParse(leagues.body) as { data?: { leagueID?: string; sportID?: string }[] } | null;
  const leagueIds = leaguesParsed?.data?.map((l) => `${l.leagueID} (${l.sportID})`) ?? [];
  results.push({
    check: "full league list",
    path: "/v2/leagues/",
    status: leagues.status,
    ok: leagues.status === 200,
    summary:
      leagues.status === 200
        ? `${leagueIds.length} leagues on this plan.`
        : "Failed.",
    detail: { leagueIds, sample: leagues.status === 200 ? undefined : leagues.body.slice(0, 600) },
  });

  // 2. MLB events with odds — bookmaker IDs, prop stat types, plan notices.
  const mlb = await call("/v2/events/?leagueID=MLB&oddsAvailable=true&limit=2", key);
  results.push(
    analyzeEvents("MLB events + odds analysis", "/v2/events/?leagueID=MLB&oddsAvailable=true&limit=2", mlb.status, mlb.body),
  );

  // 3. Tennis probe by sportID (league list may not use ATP/WTA).
  const tennis = await call("/v2/events/?sportID=TENNIS&oddsAvailable=true&limit=2", key);
  results.push(
    analyzeEvents("Tennis events + odds analysis", "/v2/events/?sportID=TENNIS&oddsAvailable=true&limit=2", tennis.status, tennis.body),
  );

  // 4. College basketball probe (NCAAB confirmed in league list).
  const ncaab = await call("/v2/events/?leagueID=NCAAB&limit=2", key);
  results.push(
    analyzeEvents("NCAAB events analysis (live fields, fouls?)", "/v2/events/?leagueID=NCAAB&limit=2", ncaab.status, ncaab.body),
  );

  return {
    provider: "sportsgameodds",
    configured: true,
    ranAt,
    results,
    note:
      "Battery v2: bookmaker coverage is read from byBookmaker keys inside real odds objects " +
      "(the /v2/bookmakers/ endpoint does not exist). planNotices show what the current tier withholds. " +
      "No credentials are included in this report.",
  };
}
