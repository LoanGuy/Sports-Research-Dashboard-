import { describe, expect, it } from "vitest";
import {
  allHitProbability,
  americanToDecimal,
  americanToImpliedProb,
  decimalToAmerican,
  decimalToImpliedProb,
  equalPickBreakEven,
  evaluateEntry,
  evaluateExchangeContract,
  expectedValue,
  hitCountDistribution,
  kelly,
  median,
  noVigFromAmerican,
  probToAmerican,
  probToDecimal,
  removeVig,
  evaluateMakeOrder,
  makeOrderLadder,
  mirrorAmerican,
  stepAmerican,
  isValidTickPrice,
  nextTickUp,
  snapToTick,
} from "@shared/odds";

describe("odds conversions", () => {
  it("converts positive American odds to decimal", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 10);
  });

  it("converts negative American odds to decimal", () => {
    expect(americanToDecimal(-120)).toBeCloseTo(1.8333333333, 8);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9090909091, 8);
  });

  it("converts decimal odds to American", () => {
    expect(decimalToAmerican(2.5)).toBeCloseTo(150, 8);
    expect(decimalToAmerican(1.8333333333)).toBeCloseTo(-120, 4);
    expect(decimalToAmerican(2.0)).toBeCloseTo(100, 8);
  });

  it("round-trips American -> decimal -> American", () => {
    for (const odds of [-250, -110, -105, 105, 130, 400]) {
      expect(decimalToAmerican(americanToDecimal(odds))).toBeCloseTo(odds, 6);
    }
  });

  it("rejects zero and non-finite American odds", () => {
    expect(() => americanToDecimal(0)).toThrow();
    expect(() => americanToImpliedProb(Number.NaN)).toThrow();
  });
});

describe("implied probability", () => {
  it("computes implied probability from positive American odds", () => {
    expect(americanToImpliedProb(100)).toBeCloseTo(0.5, 10);
    expect(americanToImpliedProb(150)).toBeCloseTo(0.4, 10);
    expect(americanToImpliedProb(300)).toBeCloseTo(0.25, 10);
  });

  it("computes implied probability from negative American odds", () => {
    expect(americanToImpliedProb(-110)).toBeCloseTo(110 / 210, 10);
    expect(americanToImpliedProb(-200)).toBeCloseTo(2 / 3, 10);
  });

  it("computes implied probability from decimal odds", () => {
    expect(decimalToImpliedProb(2.0)).toBeCloseTo(0.5, 10);
    expect(decimalToImpliedProb(4.0)).toBeCloseTo(0.25, 10);
    expect(() => decimalToImpliedProb(1.0)).toThrow();
  });

  it("converts fair probability to fair odds", () => {
    expect(probToDecimal(0.5)).toBeCloseTo(2.0, 10);
    expect(probToAmerican(0.5)).toBeCloseTo(-100, 10);
    expect(probToAmerican(0.6)).toBeCloseTo(-150, 8);
    expect(probToAmerican(0.4)).toBeCloseTo(150, 8);
    expect(() => probToAmerican(0)).toThrow();
    expect(() => probToAmerican(1)).toThrow();
  });
});

describe("no-vig and hold", () => {
  it("removes vig from a symmetric -110/-110 market", () => {
    const { fairProbs, hold } = noVigFromAmerican(-110, -110);
    expect(fairProbs[0]).toBeCloseTo(0.5, 10);
    expect(fairProbs[1]).toBeCloseTo(0.5, 10);
    expect(hold).toBeCloseTo(2 * (110 / 210) - 1, 10); // ~4.76%
  });

  it("removes vig from an asymmetric market", () => {
    const { fairProbs } = noVigFromAmerican(-150, 130);
    const rawA = 150 / 250; // 0.6
    const rawB = 100 / 230; // ~0.43478
    expect(fairProbs[0]).toBeCloseTo(rawA / (rawA + rawB), 10);
    expect(fairProbs[1]).toBeCloseTo(rawB / (rawA + rawB), 10);
    expect(fairProbs[0] + fairProbs[1]).toBeCloseTo(1, 10);
  });

  it("handles three-way markets", () => {
    const { fairProbs, hold } = removeVig([0.45, 0.35, 0.28]);
    expect(fairProbs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(hold).toBeCloseTo(0.08, 10);
  });

  it("requires at least two sides", () => {
    expect(() => removeVig([0.5])).toThrow();
  });
});

describe("expected value and Kelly", () => {
  it("computes EV per unit staked", () => {
    // 55% fair chance at even money (decimal 2.0): EV = 0.55*2 - 1 = 0.10
    expect(expectedValue(0.55, 2.0)).toBeCloseTo(0.1, 10);
    // Fair coin at -110: negative EV
    expect(expectedValue(0.5, americanToDecimal(-110))).toBeLessThan(0);
  });

  it("computes Kelly fractions", () => {
    // b=1, p=0.55, q=0.45 -> (0.55-0.45)/1 = 0.10
    const k = kelly(0.55, 2.0);
    expect(k.full).toBeCloseTo(0.1, 10);
    expect(k.half).toBeCloseTo(0.05, 10);
    expect(k.quarter).toBeCloseTo(0.025, 10);
  });

  it("clamps negative Kelly to zero", () => {
    const k = kelly(0.4, 1.5);
    expect(k.full).toBe(0);
    expect(k.half).toBe(0);
    expect(k.quarter).toBe(0);
  });
});

describe("median consensus", () => {
  it("takes the middle value for odd counts", () => {
    expect(median([0.5, 0.9, 0.1])).toBeCloseTo(0.5, 10);
  });

  it("averages the middle two for even counts", () => {
    expect(median([0.4, 0.6, 0.5, 0.7])).toBeCloseTo(0.55, 10);
  });

  it("rejects empty input", () => {
    expect(() => median([])).toThrow();
  });
});

describe("entry break-even and evaluation", () => {
  it("computes equal-probability break-even per pick", () => {
    // 3-pick all-or-nothing paying 5x: (1/5)^(1/3) ~ 58.48%
    expect(equalPickBreakEven(5, 3)).toBeCloseTo(0.5848, 4);
    // 2-pick paying 3x: (1/3)^(1/2) ~ 57.74%
    expect(equalPickBreakEven(3, 2)).toBeCloseTo(0.5774, 4);
  });

  it("computes all-hit probability with unequal picks", () => {
    expect(allHitProbability([0.6, 0.5])).toBeCloseTo(0.3, 10);
    expect(allHitProbability([0.58, 0.58, 0.58])).toBeCloseTo(0.58 ** 3, 10);
  });

  it("builds the hit-count distribution (Poisson binomial)", () => {
    const dist = hitCountDistribution([0.5, 0.5]);
    expect(dist[0]).toBeCloseTo(0.25, 10);
    expect(dist[1]).toBeCloseTo(0.5, 10);
    expect(dist[2]).toBeCloseTo(0.25, 10);

    // Unequal probabilities, verified by hand enumeration.
    const d2 = hitCountDistribution([0.7, 0.4]);
    expect(d2[0]).toBeCloseTo(0.3 * 0.6, 10);
    expect(d2[1]).toBeCloseTo(0.7 * 0.6 + 0.3 * 0.4, 10);
    expect(d2[2]).toBeCloseTo(0.7 * 0.4, 10);
    expect(d2.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("evaluates an all-or-nothing entry", () => {
    const result = evaluateEntry([0.6, 0.6, 0.6], [{ hits: 3, multiplier: 5 }]);
    expect(result.allHitProb).toBeCloseTo(0.216, 10);
    expect(result.expectedPayout).toBeCloseTo(0.216 * 5, 10);
    expect(result.expectedReturn).toBeCloseTo(0.216 * 5 - 1, 10);
  });

  it("evaluates a flex entry with several tiers", () => {
    const probs = [0.55, 0.55, 0.55];
    const tiers = [
      { hits: 3, multiplier: 2.25 },
      { hits: 2, multiplier: 1.25 },
    ];
    const dist = hitCountDistribution(probs);
    const result = evaluateEntry(probs, tiers);
    expect(result.expectedPayout).toBeCloseTo(dist[3] * 2.25 + dist[2] * 1.25, 10);
    expect(result.tierProbs).toHaveLength(2);
    expect(result.tierProbs[0].prob).toBeCloseTo(dist[3], 10);
  });

  it("rejects tiers outside the pick count", () => {
    expect(() => evaluateEntry([0.5, 0.5], [{ hits: 3, multiplier: 5 }])).toThrow();
  });
});

describe("exchange contract evaluation", () => {
  it("computes edge from the executable price, fees included", () => {
    // 55% fair chance, contract costs 52 cents, no fees.
    const result = evaluateExchangeContract(52, 0, 0.55);
    expect(result.breakEvenProb).toBeCloseTo(0.52, 10);
    expect(result.edge).toBeCloseTo(0.03, 10);
    expect(result.expectedProfit).toBeCloseTo(0.03, 10);
    expect(result.feeAdjustedReturn).toBeCloseTo(0.03 / 0.52, 10);
  });

  it("includes fees in the break-even", () => {
    const withFee = evaluateExchangeContract(52, 1, 0.55);
    expect(withFee.breakEvenProb).toBeCloseTo(0.53, 10);
    expect(withFee.edge).toBeCloseTo(0.02, 10);
  });

  it("rejects prices at or beyond the bounds", () => {
    expect(() => evaluateExchangeContract(0, 0, 0.5)).toThrow();
    expect(() => evaluateExchangeContract(100, 0, 0.5)).toThrow();
    expect(() => evaluateExchangeContract(99, 2, 0.5)).toThrow();
  });
});

describe("Novig make/take orders", () => {
  it("mirrors American odds for the counterparty side", () => {
    expect(mirrorAmerican(-120)).toBe(120);
    expect(mirrorAmerican(117)).toBe(-117);
    expect(mirrorAmerican(100)).toBe(-100);
    expect(() => mirrorAmerican(-50)).toThrow();
  });

  it("evaluates a make order for both sides of the match", () => {
    // Fair 55%; posting -120 needs 54.5% — thin positive edge for you.
    const evaln = evaluateMakeOrder(0.55, -120);
    expect(evaln.breakEvenProb).toBeCloseTo(0.5455, 3);
    expect(evaln.edgePts).toBeCloseTo(0.45, 1);
    expect(evaln.counterpartyOdds).toBe(120);
    // Taker of +120 needs 45.45% while fair for them is 45% — slightly bad
    // for them, so the fill is plausible but not instant.
    expect(evaln.counterpartyEdgePts).toBeCloseTo(-0.45, 1);
    expect(evaln.fillOutlook).toBe("reasonable");
  });

  it("flags prices that give the taker value as fast fills", () => {
    // Posting -140 when fair is 55%: taker gets +140 needing 41.7% vs fair 45%.
    const evaln = evaluateMakeOrder(0.55, -140);
    expect(evaln.counterpartyEdgePts).toBeGreaterThan(0);
    expect(evaln.fillOutlook).toBe("fills fast");
  });

  it("steps the price ladder across the ±100 boundary", () => {
    expect(stepAmerican(-110, 1)).toBe(-105);
    expect(stepAmerican(-110, 2)).toBe(100);
    expect(stepAmerican(-110, 3)).toBe(105);
    expect(stepAmerican(120, 2)).toBe(130);
    const ladder = makeOrderLadder(0.55, -110, 4);
    expect(ladder.map((r) => r.odds)).toEqual([-110, -105, 100, 105]);
    // Edges strictly improve for you as the ladder climbs.
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].evaluation.edgePts).toBeGreaterThan(ladder[i - 1].evaluation.edgePts);
    }
  });
});

describe("Novig tick schedule", () => {
  it("validates prices against band-specific ticks", () => {
    // Novig's published examples: -110/-115/-120 valid, -111/-113 not.
    expect(isValidTickPrice(-110)).toBe(true);
    expect(isValidTickPrice(-115)).toBe(true);
    expect(isValidTickPrice(-111)).toBe(false);
    expect(isValidTickPrice(-113)).toBe(false);
    // Outer bands: 10 to ±299, 25 to ±499, 50 to ±999, 100 beyond.
    expect(isValidTickPrice(250)).toBe(true);
    expect(isValidTickPrice(245)).toBe(false);
    expect(isValidTickPrice(-325)).toBe(true);
    expect(isValidTickPrice(-310)).toBe(false);
    expect(isValidTickPrice(650)).toBe(true);
    expect(isValidTickPrice(1300)).toBe(true);
    expect(isValidTickPrice(1350)).toBe(false);
    // No -100 (canonical +100), nothing inside ±100.
    expect(isValidTickPrice(-100)).toBe(false);
    expect(isValidTickPrice(100)).toBe(true);
    expect(isValidTickPrice(50)).toBe(false);
  });

  it("steps across band boundaries with the right tick", () => {
    expect(nextTickUp(-300)).toBe(-290); // entering the 10-tick band
    expect(nextTickUp(-210)).toBe(-200);
    expect(nextTickUp(-200)).toBe(-195); // entering the 5-tick band
    expect(nextTickUp(195)).toBe(200); // leaving the 5-tick band
    expect(nextTickUp(290)).toBe(300);
    expect(nextTickUp(475)).toBe(500);
    expect(nextTickUp(-105)).toBe(100); // never lands on -100
  });

  it("snaps off-tick take prices toward the maker before laddering", () => {
    expect(snapToTick(-117)).toBe(-115);
    expect(snapToTick(122)).toBe(125);
    expect(snapToTick(-205)).toBe(-200);
    const ladder = makeOrderLadder(0.55, -117, 4);
    // Rung 0 keeps the raw take price; rungs 1+ are approved ticks.
    expect(ladder[0].odds).toBe(-117);
    expect(ladder.slice(1).map((r) => r.odds)).toEqual([-115, -110, -105]);
    expect(ladder.slice(1).every((r) => isValidTickPrice(r.odds))).toBe(true);
  });
});
