import { describe, expect, it } from "vitest";
import { outsFromInnings, statGroupForMarket, statValueForMarket, verifiedForm } from "../../../server/mlb";
import { buildOpportunities } from "../../../server/opportunities";
import type { Event, MarketRecord } from "@shared/schema";

describe("MLB stat helpers", () => {
  it("converts innings-pitched thirds notation to outs", () => {
    expect(outsFromInnings("6.1")).toBe(19);
    expect(outsFromInnings("6.2")).toBe(20);
    expect(outsFromInnings("7")).toBe(21);
    expect(outsFromInnings("bad")).toBeNull();
  });

  it("maps markets to the settling stat", () => {
    expect(statValueForMarket("Hits", { hits: 2 })).toBe(2);
    expect(statValueForMarket("Total bases", { totalBases: "3" })).toBe(3);
    expect(statValueForMarket("Pitcher outs recorded", { inningsPitched: "5.2" })).toBe(17);
    expect(statValueForMarket("Moneyline", { hits: 2 })).toBeNull();
    expect(statGroupForMarket("Pitcher strikeouts")).toBe("pitching");
    expect(statGroupForMarket("Hits")).toBe("hitting");
    expect(statGroupForMarket("Moneyline")).toBeNull();
  });

  it("computes verified form against the offered line", () => {
    const logs = [1, 0, 2, 1, 1, 0, 3, 1, 2, 1].map((h, i) => ({
      date: `2026-07-${String(i + 10).padStart(2, "0")}`,
      stats: { hits: h },
    }));
    const over = verifiedForm(logs, "Hits", "over", 0.5);
    expect(over).not.toBeNull();
    expect(over!.hits).toBe(8); // 8 of 10 games with 1+ hits
    expect(over!.total).toBe(10);
    const under = verifiedForm(logs, "Hits", "under", 0.5);
    expect(under!.hits).toBe(2);
    // too few settled games → null, never a fake grade
    expect(verifiedForm(logs.slice(0, 2), "Hits", "over", 0.5)).toBeNull();
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

let rowId = 0;
function makeRow(bookmaker: string, overOdds: number, underOdds: number, overrides: Partial<MarketRecord> = {}): MarketRecord {
  return {
    id: ++rowId,
    source: "sportsgameodds",
    bookmaker,
    sourceEventId: "evt-1",
    eventId: 1,
    playerName: "Ramon Vega",
    playerId: "RAMON_VEGA_1_MLB",
    marketType: "Hits",
    marketPeriod: "game",
    line: 0.5,
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
    ...overrides,
  } as MarketRecord;
}

const baseRows = () => [
  makeRow("fanduel", -120, 100),
  makeRow("draftkings", -118, -102),
  makeRow("betmgm", -122, 102),
  makeRow("hardrockbet", 110, -130),
];

const ctxBase = {
  id: 1,
  eventId: 1,
  gamePk: 999,
  gameDate: "2026-07-21",
  homeProbable: null,
  awayProbable: null,
  capturedAt: NOW,
};

describe("lineup gating from MLB context", () => {
  it("flags a batter who is not in the posted lineup and caps confidence", () => {
    const ctx = {
      ...ctxBase,
      homeLineup: [{ id: 1, fullName: "Somebody Else", order: 1 }],
      awayLineup: [{ id: 2, fullName: "Another Guy", order: 1 }],
    };
    const result = buildOpportunities(baseRows(), new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]), {
      contexts: [ctx as never],
    });
    expect(result.length).toBeGreaterThan(0);
    const best = result[0];
    expect(best.lineupStatus).toBe("not_in_lineup");
    expect(best.matchNeedsReview).toBe(true);
    expect(best.dataConfidence).toBe("low");
    expect(best.whatCouldGoWrong.join(" ")).toContain("NOT in the posted lineup");
  });

  it("confirms a batter who is in the posted lineup", () => {
    const ctx = {
      ...ctxBase,
      homeLineup: [{ id: 1, fullName: "Ramon Vega", order: 3 }],
      awayLineup: [],
    };
    const result = buildOpportunities(baseRows(), new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]), {
      contexts: [ctx as never],
    });
    const best = result[0];
    expect(best.lineupStatus).toBe("confirmed");
    expect(best.lineupNote).toContain("batting 3");
  });

  it("caps confidence when lineups are not posted yet", () => {
    const ctx = { ...ctxBase, homeLineup: [], awayLineup: [] };
    const result = buildOpportunities(baseRows(), new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]), {
      contexts: [ctx as never],
    });
    const best = result[0];
    expect(best.lineupStatus).toBe("unavailable");
    expect(["C", "D"]).toContain(best.categories.find((c) => c.key === "data")!.grade);
  });

  it("grades Recent form from verified game logs, preferring them over trends", () => {
    const logs = {
      id: 1,
      playerId: 7,
      playerKey: "ramon vega",
      statGroup: "hitting",
      season: "2026",
      logs: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-07-${String(i + 10).padStart(2, "0")}`,
        stats: { hits: i === 0 ? 0 : 1 },
      })),
      capturedAt: NOW,
    };
    const result = buildOpportunities(baseRows(), new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]), {
      playerLogs: [logs as never],
    });
    const best = result[0];
    const form = best.categories.find((c) => c.key === "form")!;
    expect(form.grade).toBe("A"); // over 0.5 hits in 9 of last 10, verified
    expect(form.note).toContain("verified game logs");
    expect(best.recentForm[0].label).toContain("verified");
  });
});
