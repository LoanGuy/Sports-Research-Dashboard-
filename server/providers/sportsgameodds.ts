/**
 * SportsGameOdds provider verification.
 *
 * Runs a small battery of real API calls to establish what the account's
 * plan actually covers — bookmaker list (Hard Rock Bet? PrizePicks? Novig?),
 * sports/leagues, and a sample odds pull — per the project rule that
 * coverage claims only count when verified against actual API responses.
 *
 * Designed to be gentle with the free tier's rate limit (10 requests/min):
 * the full battery is at most 7 sequential requests.
 *
 * The API key comes from SPORTSGAMEODDS_API_KEY and is never echoed back.
 */

const BASE = "https://api.sportsgameodds.com";

export interface CheckResult {
  check: string;
  path: string;
  status: number | null;
  ok: boolean;
  summary: string;
  /** Truncated raw response so unexpected shapes can be inspected. */
  sample: string;
}

export interface ProviderCheckReport {
  provider: "sportsgameodds";
  configured: boolean;
  authStyle: "header" | "query" | "unknown" | null;
  ranAt: string;
  results: CheckResult[];
  note: string;
}

async function call(
  path: string,
  key: string,
  style: "header" | "query",
): Promise<{ status: number | null; body: string }> {
  const url = new URL(path, BASE);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (style === "header") {
    headers["X-Api-Key"] = key;
  } else {
    url.searchParams.set("apiKey", key);
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    return { status: res.status, body };
  } catch (error) {
    return { status: null, body: `NETWORK ERROR: ${String(error)}` };
  }
}

function contains(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((n) => lower.includes(n.toLowerCase()));
}

function truncate(text: string, max = 900): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated ${text.length} chars total]` : text;
}

export async function runSportsGameOddsCheck(): Promise<ProviderCheckReport> {
  const key = process.env.SPORTSGAMEODDS_API_KEY;
  const ranAt = new Date().toISOString();
  if (!key) {
    return {
      provider: "sportsgameodds",
      configured: false,
      authStyle: null,
      ranAt,
      results: [],
      note: "SPORTSGAMEODDS_API_KEY is not set. Add it as an environment variable and redeploy.",
    };
  }

  const results: CheckResult[] = [];

  // 1. Establish which auth style the key accepts (header first, query fallback).
  let authStyle: "header" | "query" | "unknown" = "header";
  let probe = await call("/v2/sports/", key, "header");
  if (probe.status === 401 || probe.status === 403) {
    const retry = await call("/v2/sports/", key, "query");
    if (retry.status === 200) {
      authStyle = "query";
      probe = retry;
    } else {
      authStyle = "unknown";
    }
  }

  const sportsFound = contains(probe.body, ["baseball", "tennis", "basketball"]);
  results.push({
    check: "sports list (auth probe)",
    path: "/v2/sports/",
    status: probe.status,
    ok: probe.status === 200,
    summary:
      probe.status === 200
        ? `OK. Target sports present: ${sportsFound.join(", ") || "none found in response"}`
        : `Failed (auth style: ${authStyle}). See sample.`,
    sample: truncate(probe.body),
  });

  const style: "header" | "query" = authStyle === "query" ? "query" : "header";

  // 2. Bookmaker list — the headline check: Hard Rock Bet / PrizePicks / Novig.
  const bookmakers = await call("/v2/bookmakers/", key, style);
  const targetBooks = contains(bookmakers.body, [
    "hard rock",
    "hardrock",
    "prizepicks",
    "prize picks",
    "novig",
  ]);
  results.push({
    check: "bookmaker list — Hard Rock / PrizePicks / Novig",
    path: "/v2/bookmakers/",
    status: bookmakers.status,
    ok: bookmakers.status === 200,
    summary:
      bookmakers.status === 200
        ? `OK. Target platforms found in list: ${targetBooks.join(", ") || "NONE of the three target platforms"}`
        : "Failed. See sample.",
    sample: truncate(bookmakers.body, 2000),
  });

  // 3. Leagues — MLB, NCAAB, ATP/WTA coverage.
  const leagues = await call("/v2/leagues/", key, style);
  const leaguesFound = contains(leagues.body, ["MLB", "NCAAB", "ATP", "WTA"]);
  results.push({
    check: "league list — MLB / NCAAB / ATP / WTA",
    path: "/v2/leagues/",
    status: leagues.status,
    ok: leagues.status === 200,
    summary:
      leagues.status === 200
        ? `OK. Target leagues present: ${leaguesFound.join(", ") || "none found in response"}`
        : "Failed. See sample.",
    sample: truncate(leagues.body),
  });

  // 4. Sample MLB event with odds — proves odds access and shows the shape.
  const mlbEvents = await call("/v2/events/?leagueID=MLB&oddsAvailable=true&limit=1", key, style);
  results.push({
    check: "sample MLB event with odds",
    path: "/v2/events/?leagueID=MLB&oddsAvailable=true&limit=1",
    status: mlbEvents.status,
    ok: mlbEvents.status === 200,
    summary:
      mlbEvents.status === 200
        ? `OK. Response length ${mlbEvents.body.length} chars. Player-prop markers present: ${
            contains(mlbEvents.body, ["strikeout", "total bases", "hits", "player"]).join(", ") ||
            "none obvious"
          }`
        : "Failed. See sample.",
    sample: truncate(mlbEvents.body, 2500),
  });

  return {
    provider: "sportsgameodds",
    configured: true,
    authStyle,
    ranAt,
    results,
    note:
      "This report contains raw provider responses (truncated) and no credentials. " +
      "Findings only count as verified when this battery succeeds — marketing pages do not.",
  };
}
