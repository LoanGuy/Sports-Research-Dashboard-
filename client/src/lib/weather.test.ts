import { describe, expect, it } from "vitest";
import { conditionsFromWeather, stadiumForTeam, type StoredWeather } from "../../../server/weather";
import { buildOpportunities } from "../../../server/opportunities";
import type { Event, MarketRecord } from "@shared/schema";

const base: StoredWeather = {
  venue: "Test Park",
  roof: "outdoor",
  tempF: 78,
  windMph: 6,
  windDirection: "SW",
  rainProbPct: 10,
  shortForecast: "Partly cloudy",
  forecastFor: "2026-07-21T23:00:00Z",
  capturedAt: "2026-07-21T17:00:00Z",
};

describe("weather → conditions grading", () => {
  it("grades calm weather B, wind/rain C, heavy rain D, indoor B", () => {
    expect(conditionsFromWeather(base).grade).toBe("B");
    expect(conditionsFromWeather({ ...base, windMph: 18 }).grade).toBe("C");
    expect(conditionsFromWeather({ ...base, rainProbPct: 60 }).grade).toBe("D");
    const indoor = conditionsFromWeather({ ...base, roof: "fixed" });
    expect(indoor.grade).toBe("B");
    expect(indoor.note).toContain("indoors");
  });

  it("resolves stadiums by home-team name, tolerating partial matches", () => {
    expect(stadiumForTeam("New York Yankees")?.venue).toBe("Yankee Stadium");
    expect(stadiumForTeam("Athletics")?.venue).toBe("Sutter Health Park");
    expect(stadiumForTeam("Charlotte Aviators")).toBeNull();
  });
});

const NOW = new Date("2026-07-21T18:00:00Z");

function makeEvent(id: number): Event {
  return {
    id,
    sport: "mlb",
    league: "MLB",
    tournament: null,
    startTime: new Date("2026-07-21T23:05:00Z"),
    timezone: "UTC",
    homeTeam: "Charlotte Aviators",
    awayTeam: "Portland Pilots",
    status: "scheduled",
    createdAt: NOW,
  };
}

let rowId = 100;
function makeRow(bookmaker: string, overOdds: number, underOdds: number): MarketRecord {
  return {
    id: ++rowId,
    source: "sportsgameodds",
    bookmaker,
    sourceEventId: "evt-1",
    eventId: 1,
    playerName: "Ramon Vega",
    playerId: "RAMON_VEGA_1_MLB",
    marketType: "Pitcher strikeouts",
    marketPeriod: "game",
    line: 6.5,
    overOdds,
    underOdds,
    yesPriceCents: null,
    noPriceCents: null,
    bidCents: null,
    askCents: null,
    projection: null,
    payoutMultiplier: null,
    isLive: false,
    retrievedAt: new Date("2026-07-21T17:55:00Z"),
    changedAt: new Date("2026-07-21T17:55:00Z"),
    gradingRules: null,
    sourceStatus: "ok",
    freshness: "delayed",
  } as MarketRecord;
}

describe("weather in the opportunity builder", () => {
  it("grades Conditions from stored weather and warns pitcher props about rain", () => {
    const ctx = {
      id: 1,
      eventId: 1,
      gamePk: 1,
      gameDate: "2026-07-21",
      homeProbable: null,
      awayProbable: null,
      homeLineup: [],
      awayLineup: [],
      weather: { ...base, rainProbPct: 55 },
      capturedAt: NOW,
    };
    const rows = [
      makeRow("fanduel", -120, 100),
      makeRow("draftkings", -118, -102),
      makeRow("betmgm", -122, 102),
      makeRow("hardrockbet", 110, -130),
    ];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]), {
      contexts: [ctx as never],
    });
    expect(result.length).toBeGreaterThan(0);
    const best = result[0];
    const conditions = best.categories.find((c) => c.key === "conditions")!;
    expect(conditions.grade).toBe("D"); // 55% rain
    expect(best.weather?.rainProbPct).toBe(55);
    expect(best.whatCouldGoWrong.join(" ")).toContain("Rain chance is 55%");
  });
});
