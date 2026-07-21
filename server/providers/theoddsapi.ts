/**
 * The Odds API (the-odds-api.com) verification battery.
 *
 * Primary question: does Hard Rock Bet ("hardrockbet") actually appear in
 * real odds responses? Secondary: MLB player-prop market depth, and credit
 * accounting (the free tier has 500 credits/month; this battery costs
 * roughly 10 — the sports list is free, the odds calls are metered at
 * markets x regions).
 *
 * The key is read from THEODDSAPI_KEY (also accepts THE_ODDS_API_KEY,
 * ODDS_API_KEY, THEODDS_API_KEY) and is never echoed back.
 */

const BASE = "https://api.the-odds-api.com";

const KEY_ENV_NAMES = ["THEODDSAPI_KEY", "THE_ODDS_API_KEY", "ODDS_API_KEY", "THEODDS_API_KEY"];

export function findOddsApiKey(): { name: string; key: string } | null {
  for (const name of KEY_ENV_NAMES) {
    const key = process.env[name];
    if (key) return { name, key };
  }
  return null;
}

export interface OddsApiCheckResult {
  check: string;
  path: string;
  status: number | null;
  ok: boolean;
  summary: string;
  detail: Record<string, unknown>;
}

export interface OddsApiReport {
  provider: "theoddsapi";
  configured: boolean;
  keyEnvName: string | null;
  ranAt: string;
  creditsUsed: string | null;
  creditsRemaining: string | null;
  results: OddsApiCheckResult[];
  note: string;
}

async function call(
  path: string,
  key: string,
): Promise<{ status: number | null; body: string; used: string | null; remaining: string | null }> {
  const url = new URL(path, BASE);
  url.searchParams.set("apiKey", key);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    return {
      status: res.status,
      body: await res.text(),
      used: res.headers.get("x-requests-used"),
      remaining: res.headers.get("x-requests-remaining"),
    };
  } catch (error) {
    return { status: null, body: `NETWORK ERROR: ${String(error)}`, used: null, remaining: null };
  }
}

function tryParse(body: string): unknown | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

interface OddsApiEvent {
  id?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: { key?: string; markets?: { key?: string; outcomes?: unknown[] }[] }[];
}

function collectBooks(events: OddsApiEvent[]): Map<string, Set<string>> {
  // book key -> set of market keys seen at that book
  const books = new Map<string, Set<string>>();
  for (const event of events) {
    for (const book of event.bookmakers ?? []) {
      if (!book.key) continue;
      if (!books.has(book.key)) books.set(book.key, new Set());
      for (const market of book.markets ?? []) {
        if (market.key) books.get(book.key)!.add(market.key);
      }
    }
  }
  return books;
}

export async function runOddsApiCheck(): Promise<OddsApiReport> {
  const ranAt = new Date().toISOString();
  const found = findOddsApiKey();
  if (!found) {
    return {
      provider: "theoddsapi",
      configured: false,
      keyEnvName: null,
      ranAt,
      creditsUsed: null,
      creditsRemaining: null,
      results: [],
      note: `No key found. Set one of: ${KEY_ENV_NAMES.join(", ")} and redeploy.`,
    };
  }

  const results: OddsApiCheckResult[] = [];
  let used: string | null = null;
  let remaining: string | null = null;

  // 1. Sports list — free, proves auth.
  const sports = await call("/v4/sports/", found.key);
  used = sports.used ?? used;
  remaining = sports.remaining ?? remaining;
  const sportsParsed = tryParse(sports.body) as { key?: string; title?: string }[] | null;
  const hasMlb = Array.isArray(sportsParsed) && sportsParsed.some((s) => s.key === "baseball_mlb");
  results.push({
    check: "auth + sports list (free)",
    path: "/v4/sports/",
    status: sports.status,
    ok: sports.status === 200,
    summary:
      sports.status === 200
        ? `OK. ${Array.isArray(sportsParsed) ? sportsParsed.length : "?"} sports; baseball_mlb present: ${hasMlb}`
        : "Failed — check the key.",
    detail: { sample: sports.status === 200 ? undefined : sports.body.slice(0, 400) },
  });
  if (sports.status !== 200) {
    return {
      provider: "theoddsapi",
      configured: true,
      keyEnvName: found.name,
      ranAt,
      creditsUsed: used,
      creditsRemaining: remaining,
      results,
      note: "Auth failed; no metered calls were made.",
    };
  }

  // 2. MLB main-line odds across us + us2 regions — THE Hard Rock check.
  //    Cost: 2 markets x 2 regions = ~4 credits.
  const odds = await call("/v4/sports/baseball_mlb/odds/?regions=us,us2&markets=h2h,totals&oddsFormat=american", found.key);
  used = odds.used ?? used;
  remaining = odds.remaining ?? remaining;
  const events = (tryParse(odds.body) as OddsApiEvent[] | null) ?? [];
  const books = collectBooks(events);
  const bookKeys = Array.from(books.keys()).sort();
  const hardRock = bookKeys.filter((k) => k.toLowerCase().includes("hardrock"));
  results.push({
    check: "MLB main lines (us + us2) — Hard Rock present?",
    path: "/v4/sports/baseball_mlb/odds/?regions=us,us2&markets=h2h,totals",
    status: odds.status,
    ok: odds.status === 200,
    summary:
      odds.status === 200
        ? `OK. ${events.length} events, ${bookKeys.length} bookmakers. HARD ROCK: ${hardRock.length > 0 ? `YES — ${hardRock.join(", ")}` : "not present in this response"}`
        : "Failed. See sample.",
    detail: {
      bookmakerKeys: bookKeys,
      hardRockKeys: hardRock,
      sample: odds.status === 200 ? undefined : odds.body.slice(0, 400),
    },
  });

  // 3. Player props for one event — prop depth + does Hard Rock carry props?
  //    Cost: 3 markets x 2 regions = ~6 credits.
  const firstEvent = events.find((e) => e.id);
  if (firstEvent?.id) {
    const props = await call(
      `/v4/sports/baseball_mlb/events/${firstEvent.id}/odds/?regions=us,us2&markets=pitcher_strikeouts,batter_total_bases,batter_hits&oddsFormat=american`,
      found.key,
    );
    used = props.used ?? used;
    remaining = props.remaining ?? remaining;
    const propEvent = (tryParse(props.body) as OddsApiEvent | null) ?? {};
    const propBooks = collectBooks([propEvent]);
    const propSummary = Array.from(propBooks.entries()).map(([book, markets]) => `${book}: ${Array.from(markets).sort().join("/")}`);
    const hardRockProps = Array.from(propBooks.keys()).filter((k) => k.toLowerCase().includes("hardrock"));
    results.push({
      check: "MLB player props for one event — depth + Hard Rock props?",
      path: `/v4/sports/baseball_mlb/events/{id}/odds/?regions=us,us2&markets=pitcher_strikeouts,batter_total_bases,batter_hits`,
      status: props.status,
      ok: props.status === 200,
      summary:
        props.status === 200
          ? `OK. ${propBooks.size} books post these props. Hard Rock props: ${hardRockProps.length > 0 ? `YES — ${hardRockProps.join(", ")}` : "not in this response"}`
          : "Failed. See sample.",
      detail: {
        event: `${firstEvent.away_team} @ ${firstEvent.home_team}`,
        booksWithProps: propSummary,
        sample: props.status === 200 ? undefined : props.body.slice(0, 400),
      },
    });
  } else {
    results.push({
      check: "MLB player props for one event",
      path: "(skipped)",
      status: null,
      ok: false,
      summary: "Skipped — no MLB events in the main-line response to probe.",
      detail: {},
    });
  }

  return {
    provider: "theoddsapi",
    configured: true,
    keyEnvName: found.name,
    ranAt,
    creditsUsed: used,
    creditsRemaining: remaining,
    results,
    note:
      "Credit meter comes from the provider's own response headers. Findings only count as verified " +
      "when this battery succeeds — bookmaker marketing pages do not. No credentials are included.",
  };
}
