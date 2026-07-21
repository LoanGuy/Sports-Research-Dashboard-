import { describe, expect, it } from "vitest";
import { betFlags, isPurePitching, summarize, type BetLeg } from "../../../server/bets";
import type { Bet } from "@shared/schema";

function leg(market: BetLeg["market"], result: BetLeg["result"], oddsAmerican: number | null = null): BetLeg {
  return { description: "leg", market, result, oddsAmerican, line: null };
}

let id = 0;
function bet(partial: Partial<Bet> & { legs: BetLeg[] }): Bet {
  return {
    id: ++id,
    placedOn: "2026-07-19",
    platform: "hardrock",
    betType: "parlay",
    legCount: partial.legs.length,
    oddsAmerican: 150,
    stake: 100,
    payout: 0,
    result: "lost",
    boostPct: null,
    bonusBet: false,
    notes: null,
    createdAt: new Date(),
    ...partial,
  } as Bet;
}

describe("betFlags", () => {
  it("flags dog and near-even moneylines", () => {
    expect(betFlags([leg("moneyline", "lost", 105)])).toContain("dog/near-even moneyline");
    expect(betFlags([leg("moneyline", "lost", -115)])).toContain("dog/near-even moneyline");
  });

  it("does not flag heavy favorites or pitching markets", () => {
    expect(betFlags([leg("moneyline", "won", -190)])).toHaveLength(0);
    expect(betFlags([leg("total_under", "won"), leg("pitcher_ks", "won")])).toHaveLength(0);
  });

  it("flags 3+ legs", () => {
    expect(betFlags([leg("pitcher_ks", "won"), leg("pitcher_ks", "won"), leg("pitcher_ks", "lost")])).toContain("3+ legs");
  });
});

describe("isPurePitching", () => {
  it("accepts pitching markets and heavy-favorite ML glue", () => {
    expect(isPurePitching([leg("total_under", "won"), leg("moneyline", "won", -210)])).toBe(true);
  });

  it("rejects dog moneylines", () => {
    expect(isPurePitching([leg("total_under", "won"), leg("moneyline", "lost", 120)])).toBe(false);
  });
});

describe("summarize", () => {
  it("computes records and cash P/L, ignoring bonus-bet stakes", () => {
    const rows: Bet[] = [
      bet({ result: "won", stake: 100, payout: 250, legs: [leg("total_under", "won")], betType: "straight" }),
      bet({ result: "lost", stake: 50, payout: 0, legs: [leg("moneyline", "lost", 110)] }),
      bet({ result: "lost", stake: 10, payout: 0, bonusBet: true, legs: [leg("moneyline", "lost", 120)] }),
    ];
    const summary = summarize(rows);
    expect(summary.overall.wins).toBe(1);
    expect(summary.overall.losses).toBe(2);
    // +150 on the win, -50 on the cash loss, 0 on the bonus-bet loss.
    expect(summary.overall.cashProfit).toBeCloseTo(100, 10);
    expect(summary.overall.cashStaked).toBeCloseTo(150, 10);

    const flagged = summary.byFlags.find((r) => r.label.includes("moneyline"));
    expect(flagged?.losses).toBe(2);
    const clean = summary.byFlags.find((r) => r.label === "No leak flags");
    expect(clean?.wins).toBe(1);
  });
});
