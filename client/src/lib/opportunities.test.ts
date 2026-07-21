import { describe, expect, it } from "vitest";
import { buildOpportunities } from "../../../server/opportunities";
import type { Event, MarketRecord } from "@shared/schema";
import { median, noVigFromAmerican, americanToImpliedProb } from "@shared/odds";

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
function makeRow(
  bookmaker: string,
  overOdds: number,
  underOdds: number,
  overrides: Partial<MarketRecord> = {},
): MarketRecord {
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
    ...overrides,
  };
}

describe("buildOpportunities with my-books filter", () => {
  it("only surfaces the user's books while all books shape the consensus", () => {
    const rows = [
      makeRow("fanduel", -120, 100),
      makeRow("draftkings", -118, -102),
      makeRow("betmgm", -122, 102),
      makeRow("hardrockbet", 105, -125),
      makeRow("caesars", 120, -140), // better price than Hard Rock, but not the user's book
    ];
    const events = new Map([[1, makeEvent(1)]]);
    const mine = buildOpportunities(rows, events, NOW, new Set(["hardrockbet"]));
    expect(mine.length).toBeGreaterThan(0);
    // Every surfaced opportunity belongs to the user's book...
    expect(mine.every((o) => o.platform === "hardrockbet")).toBe(true);
    // ...while the consensus still counts all five books.
    expect(mine[0].consensus.sourceCount).toBe(5);
  });

  it("returns nothing when the user's books have no quote in the market", () => {
    const rows = [makeRow("fanduel", -120, 100), makeRow("draftkings", -118, -102), makeRow("caesars", 120, -140)];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW, new Set(["hardrockbet"]));
    expect(result).toHaveLength(0);
  });
});

describe("buildOpportunities", () => {
  it("surfaces the best price against the median consensus", () => {
    // Three books at -120/+100, one book offering +110 on the Over.
    const rows = [
      makeRow("fanduel", -120, 100),
      makeRow("draftkings", -118, -102),
      makeRow("betmgm", -122, 102),
      makeRow("caesars", 110, -130),
    ];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW);

    expect(result.length).toBeGreaterThan(0);
    const best = result[0];
    expect(best.platform).toBe("caesars");
    expect(best.side).toBe("Over");
    expect(best.origin).toBe("live");
    expect(best.consensus.sourceCount).toBe(4);
    expect(best.sources).toHaveLength(4);

    // Edge must equal median fair prob minus the implied prob at +110.
    const fairProbs = rows.map((r) => noVigFromAmerican(r.overOdds!, r.underOdds!).fairProbs[0]);
    const expectedEdge = (median(fairProbs) - americanToImpliedProb(110)) * 100;
    expect(best.edgePts).toBeCloseTo(Number(expectedEdge.toFixed(1)), 1);
    // Grades only claim what odds can support: matchup/form/conditions stay Incomplete.
    const gradesByKey = Object.fromEntries(best.categories.map((c) => [c.key, c.grade]));
    expect(gradesByKey.matchup).toBe("Incomplete");
    expect(gradesByKey.form).toBe("Incomplete");
    expect(gradesByKey.conditions).toBe("Incomplete");
  });

  it("returns nothing when no price beats the consensus meaningfully", () => {
    // Identical books: every price is worse than fair by the vig.
    const rows = [
      makeRow("fanduel", -110, -110),
      makeRow("draftkings", -110, -110),
      makeRow("betmgm", -110, -110),
    ];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW);
    expect(result).toHaveLength(0);
  });

  it("requires at least three books for a consensus", () => {
    const rows = [makeRow("fanduel", -120, 100), makeRow("caesars", 115, -135)];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW);
    expect(result).toHaveLength(0);
  });

  it("keeps markets with different lines separate", () => {
    const rows = [
      makeRow("fanduel", -120, 100),
      makeRow("draftkings", -118, -102),
      makeRow("betmgm", -122, 102),
      // Different line — must not join the 6.5 consensus.
      makeRow("caesars", 200, -240, { line: 7.5 }),
    ];
    const result = buildOpportunities(rows, new Map([[1, makeEvent(1)]]), NOW);
    // The 7.5 group has one book (no consensus); the 6.5 group has three
    // nearly identical books (no meaningful edge). Nothing should surface.
    expect(result).toHaveLength(0);
  });
});
