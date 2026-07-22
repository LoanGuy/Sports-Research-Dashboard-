/**
 * Weather engine: National Weather Service API (api.weather.gov — free,
 * spec §19) + a static MLB stadium table. Forecasts are matched to the
 * hour of first pitch and stored on the game context; grading turns them
 * into a Conditions grade with plain-language notes.
 *
 * Honesty notes: field orientation is NOT in the table (unverified data
 * would fake wind-vs-park analysis), so wind is reported as speed +
 * compass direction only. Toronto's park is outside NWS coverage and
 * reports no forecast.
 */
import type { RoofStatus } from "@shared/types";
import type { Grade } from "@shared/types";

export interface Stadium {
  team: string; // full home-team name as providers send it
  venue: string;
  lat: number;
  lon: number;
  roof: "outdoor" | "fixed" | "retractable";
}

/** Coordinates are stadium-accurate to ~1km — plenty for a forecast grid. */
export const MLB_STADIUMS: Stadium[] = [
  { team: "Arizona Diamondbacks", venue: "Chase Field", lat: 33.445, lon: -112.067, roof: "retractable" },
  { team: "Atlanta Braves", venue: "Truist Park", lat: 33.891, lon: -84.468, roof: "outdoor" },
  { team: "Baltimore Orioles", venue: "Oriole Park at Camden Yards", lat: 39.284, lon: -76.622, roof: "outdoor" },
  { team: "Boston Red Sox", venue: "Fenway Park", lat: 42.346, lon: -71.097, roof: "outdoor" },
  { team: "Chicago Cubs", venue: "Wrigley Field", lat: 41.948, lon: -87.655, roof: "outdoor" },
  { team: "Chicago White Sox", venue: "Rate Field", lat: 41.83, lon: -87.634, roof: "outdoor" },
  { team: "Cincinnati Reds", venue: "Great American Ball Park", lat: 39.097, lon: -84.507, roof: "outdoor" },
  { team: "Cleveland Guardians", venue: "Progressive Field", lat: 41.496, lon: -81.685, roof: "outdoor" },
  { team: "Colorado Rockies", venue: "Coors Field", lat: 39.756, lon: -104.994, roof: "outdoor" },
  { team: "Detroit Tigers", venue: "Comerica Park", lat: 42.339, lon: -83.049, roof: "outdoor" },
  { team: "Houston Astros", venue: "Daikin Park", lat: 29.757, lon: -95.356, roof: "retractable" },
  { team: "Kansas City Royals", venue: "Kauffman Stadium", lat: 39.051, lon: -94.48, roof: "outdoor" },
  { team: "Los Angeles Angels", venue: "Angel Stadium", lat: 33.8, lon: -117.883, roof: "outdoor" },
  { team: "Los Angeles Dodgers", venue: "Dodger Stadium", lat: 34.074, lon: -118.24, roof: "outdoor" },
  { team: "Miami Marlins", venue: "loanDepot park", lat: 25.778, lon: -80.22, roof: "retractable" },
  { team: "Milwaukee Brewers", venue: "American Family Field", lat: 43.028, lon: -87.971, roof: "retractable" },
  { team: "Minnesota Twins", venue: "Target Field", lat: 44.982, lon: -93.278, roof: "outdoor" },
  { team: "New York Mets", venue: "Citi Field", lat: 40.757, lon: -73.846, roof: "outdoor" },
  { team: "New York Yankees", venue: "Yankee Stadium", lat: 40.829, lon: -73.926, roof: "outdoor" },
  { team: "Oakland Athletics", venue: "Sutter Health Park", lat: 38.58, lon: -121.513, roof: "outdoor" },
  { team: "Athletics", venue: "Sutter Health Park", lat: 38.58, lon: -121.513, roof: "outdoor" },
  { team: "Philadelphia Phillies", venue: "Citizens Bank Park", lat: 39.906, lon: -75.166, roof: "outdoor" },
  { team: "Pittsburgh Pirates", venue: "PNC Park", lat: 40.447, lon: -80.006, roof: "outdoor" },
  { team: "San Diego Padres", venue: "Petco Park", lat: 32.707, lon: -117.157, roof: "outdoor" },
  { team: "San Francisco Giants", venue: "Oracle Park", lat: 37.778, lon: -122.389, roof: "outdoor" },
  { team: "Seattle Mariners", venue: "T-Mobile Park", lat: 47.591, lon: -122.332, roof: "retractable" },
  { team: "St. Louis Cardinals", venue: "Busch Stadium", lat: 38.622, lon: -90.193, roof: "outdoor" },
  { team: "Tampa Bay Rays", venue: "George M. Steinbrenner Field", lat: 27.98, lon: -82.507, roof: "outdoor" },
  { team: "Texas Rangers", venue: "Globe Life Field", lat: 32.747, lon: -97.084, roof: "retractable" },
  { team: "Toronto Blue Jays", venue: "Rogers Centre", lat: 43.641, lon: -79.389, roof: "retractable" },
  { team: "Washington Nationals", venue: "Nationals Park", lat: 38.873, lon: -77.007, roof: "outdoor" },
];

export function stadiumForTeam(homeTeam: string): Stadium | null {
  const name = homeTeam.trim().toLowerCase();
  return (
    MLB_STADIUMS.find((s) => {
      const t = s.team.toLowerCase();
      return t === name || t.includes(name) || name.includes(t);
    }) ?? null
  );
}

export interface StoredWeather {
  venue: string;
  roof: Stadium["roof"];
  tempF: number | null;
  windMph: number | null;
  windDirection: string | null;
  rainProbPct: number | null;
  shortForecast: string | null;
  forecastFor: string; // ISO of the hour matched to first pitch
  capturedAt: string;
}

function parseWindMph(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /(\d+)(?:\s*to\s*(\d+))?\s*mph/i.exec(raw);
  if (!m) return null;
  return m[2] ? Number(m[2]) : Number(m[1]);
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/geo+json", "User-Agent": "edge-research-dashboard (personal research tool)" },
  });
  if (!res.ok) throw new Error(`NWS ${res.status} for ${url}`);
  return res.json();
}

/**
 * Hourly NWS forecast for the hour containing the event start. Two
 * requests per stadium (points → hourly forecast); callers should cache
 * per stadium per run.
 */
export async function fetchStadiumForecast(stadium: Stadium, startTime: Date): Promise<StoredWeather | null> {
  const points = (await fetchJson(
    `https://api.weather.gov/points/${stadium.lat.toFixed(4)},${stadium.lon.toFixed(4)}`,
  )) as { properties?: { forecastHourly?: string } };
  const hourlyUrl = points.properties?.forecastHourly;
  if (!hourlyUrl) return null;
  const forecast = (await fetchJson(hourlyUrl)) as {
    properties?: { periods?: Record<string, unknown>[] };
  };
  const periods = forecast.properties?.periods;
  if (!Array.isArray(periods)) return null;
  const target = startTime.getTime();
  let bestPeriod: Record<string, unknown> | null = null;
  for (const period of periods) {
    const start = typeof period.startTime === "string" ? Date.parse(period.startTime) : NaN;
    const end = typeof period.endTime === "string" ? Date.parse(period.endTime) : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && start <= target && target < end) {
      bestPeriod = period;
      break;
    }
  }
  if (!bestPeriod && periods.length > 0) bestPeriod = periods[0];
  if (!bestPeriod) return null;
  const pop = bestPeriod.probabilityOfPrecipitation as { value?: number | null } | undefined;
  return {
    venue: stadium.venue,
    roof: stadium.roof,
    tempF: typeof bestPeriod.temperature === "number" ? bestPeriod.temperature : null,
    windMph: parseWindMph(bestPeriod.windSpeed),
    windDirection: typeof bestPeriod.windDirection === "string" ? bestPeriod.windDirection : null,
    rainProbPct: typeof pop?.value === "number" ? pop.value : null,
    shortForecast: typeof bestPeriod.shortForecast === "string" ? bestPeriod.shortForecast : null,
    forecastFor: typeof bestPeriod.startTime === "string" ? bestPeriod.startTime : startTime.toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

export function roofStatusOf(w: StoredWeather): RoofStatus {
  if (w.roof === "fixed") return "indoor_fixed";
  if (w.roof === "retractable") return "roof_status_unknown";
  return "outdoor";
}

/**
 * Turn stored weather into a Conditions grade + plain-language note.
 * Weather is one factor, never the whole story (spec §19); a retractable
 * roof of unknown status keeps the grade conservative.
 */
export function conditionsFromWeather(w: StoredWeather): { grade: Grade; note: string } {
  if (w.roof === "fixed") {
    return { grade: "B", note: `${w.venue} is indoors — outside wind and humidity should have little effect.` };
  }
  const parts: string[] = [];
  if (w.tempF != null) parts.push(`${w.tempF}°F`);
  if (w.windMph != null) parts.push(`wind ${w.windMph} mph${w.windDirection ? ` ${w.windDirection}` : ""}`);
  if (w.rainProbPct != null) parts.push(`rain chance ${w.rainProbPct}%`);
  const summary = parts.length > 0 ? parts.join(", ") : (w.shortForecast ?? "forecast unavailable");
  const roofNote =
    w.roof === "retractable" ? " Roof status unknown — if closed, outside weather matters less." : "";

  if (w.rainProbPct != null && w.rainProbPct >= 50) {
    return {
      grade: "D",
      note: `${summary}. Rain could delay or shorten this game — added risk for pitcher innings, strikeout, and outs props.${roofNote}`,
    };
  }
  if ((w.rainProbPct != null && w.rainProbPct >= 30) || (w.windMph != null && w.windMph >= 15)) {
    return {
      grade: "C",
      note: `${summary}. ${w.windMph != null && w.windMph >= 15 ? "Strong wind can move totals and fly-ball outcomes. " : ""}${
        w.rainProbPct != null && w.rainProbPct >= 30 ? "Some rain risk. " : ""
      }Treat as a mild caution.${roofNote}`,
    };
  }
  return { grade: "B", note: `${summary}. No major weather concerns in the forecast.${roofNote}` };
}
