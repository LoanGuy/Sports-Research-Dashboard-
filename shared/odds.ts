/**
 * Odds and probability calculation library.
 *
 * Pure functions only — no API calls, no UI. Every formula here is covered
 * by unit tests in odds.test.ts. Probabilities are expressed as decimals
 * (0..1) unless a function name says otherwise.
 */

/** Convert American odds to decimal odds. +150 -> 2.5, -120 -> 1.8333... */
export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new Error("American odds must be a non-zero number");
  }
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

/** Convert decimal odds to American odds. 2.5 -> +150, 1.8333 -> -120 */
export function decimalToAmerican(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new Error("Decimal odds must be greater than 1");
  }
  if (decimal >= 2) return (decimal - 1) * 100;
  return -100 / (decimal - 1);
}

/**
 * American odds to raw implied probability (vig included).
 * Positive: P = 100 / (odds + 100). Negative: P = |odds| / (|odds| + 100).
 */
export function americanToImpliedProb(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new Error("American odds must be a non-zero number");
  }
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

/** Decimal odds to raw implied probability: P = 1 / decimal. */
export function decimalToImpliedProb(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new Error("Decimal odds must be greater than 1");
  }
  return 1 / decimal;
}

/** Fair probability to fair decimal odds. */
export function probToDecimal(prob: number): number {
  assertProb(prob);
  return 1 / prob;
}

/** Fair probability to fair American odds. */
export function probToAmerican(prob: number): number {
  assertProb(prob);
  if (prob >= 0.5) return -(prob / (1 - prob)) * 100;
  return ((1 - prob) / prob) * 100;
}

export interface NoVigResult {
  fairProbs: number[];
  /** Sportsbook hold: sum of raw implied probabilities minus 1. */
  hold: number;
}

/**
 * Remove the vig from a set of raw implied probabilities covering all
 * outcomes of one market (two-way or three-way). Each fair probability is
 * the raw probability divided by the sum of raw probabilities.
 */
export function removeVig(rawProbs: number[]): NoVigResult {
  if (rawProbs.length < 2) {
    throw new Error("Need at least two sides to remove the vig");
  }
  for (const p of rawProbs) assertProb(p);
  const total = rawProbs.reduce((sum, p) => sum + p, 0);
  return {
    fairProbs: rawProbs.map((p) => p / total),
    hold: total - 1,
  };
}

/** Two-way no-vig from American odds for both sides. */
export function noVigFromAmerican(sideA: number, sideB: number): NoVigResult {
  return removeVig([americanToImpliedProb(sideA), americanToImpliedProb(sideB)]);
}

/**
 * Expected value per 1 unit staked, for decimal odds:
 * EV = fairProbability * decimalPayout - 1.
 */
export function expectedValue(fairProb: number, decimalOdds: number): number {
  assertProb(fairProb);
  return fairProb * decimalOdds - 1;
}

export interface KellyResult {
  full: number;
  half: number;
  quarter: number;
}

/**
 * Kelly criterion: fraction of bankroll = (b*p - q) / b where b is net
 * decimal profit, p is win probability, q = 1 - p. Negative results are
 * clamped to 0 (no stake). This is informational only — the dashboard never
 * recommends a stake size from Kelly alone.
 */
export function kelly(fairProb: number, decimalOdds: number): KellyResult {
  assertProb(fairProb);
  const b = decimalOdds - 1;
  if (b <= 0) throw new Error("Decimal odds must be greater than 1");
  const q = 1 - fairProb;
  const full = Math.max(0, (b * fairProb - q) / b);
  return { full, half: full / 2, quarter: full / 4 };
}

/**
 * Median of a list of probabilities. Used as the default market consensus —
 * a simple average is never the only estimate.
 */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot take median of empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Break-even probability per pick for an equal-probability, all-or-nothing
 * entry: (1 / payoutMultiplier) ^ (1 / numberOfPicks).
 */
export function equalPickBreakEven(payoutMultiplier: number, numberOfPicks: number): number {
  if (payoutMultiplier <= 1) throw new Error("Payout multiplier must be greater than 1");
  if (!Number.isInteger(numberOfPicks) || numberOfPicks < 1) {
    throw new Error("Number of picks must be a positive integer");
  }
  return Math.pow(1 / payoutMultiplier, 1 / numberOfPicks);
}

/** Probability that every pick hits, allowing different probabilities per pick. */
export function allHitProbability(pickProbs: number[]): number {
  if (pickProbs.length === 0) throw new Error("Need at least one pick");
  for (const p of pickProbs) assertProb(p);
  return pickProbs.reduce((acc, p) => acc * p, 1);
}

/**
 * Distribution over the number of hits for independent picks with
 * (possibly different) probabilities. Index k of the result is the
 * probability of exactly k hits. Assumes independence — correlated picks
 * need a correlation warning in the UI.
 */
export function hitCountDistribution(pickProbs: number[]): number[] {
  for (const p of pickProbs) assertProb(p);
  let dist = [1];
  for (const p of pickProbs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let hits = 0; hits < dist.length; hits++) {
      next[hits] += dist[hits] * (1 - p);
      next[hits + 1] += dist[hits] * p;
    }
    dist = next;
  }
  return dist;
}

export interface FlexTier {
  /** Number of picks that must hit to earn this payout. */
  hits: number;
  /** Total payout multiplier on the entry stake (0 means loss). */
  multiplier: number;
}

export interface EntryEvaluation {
  /** Probability of each hit count, index = number of hits. */
  distribution: number[];
  /** Probability that all picks hit. */
  allHitProb: number;
  /** Expected total payout per 1 unit entered. */
  expectedPayout: number;
  /** Expected return per 1 unit entered: expectedPayout - 1. */
  expectedReturn: number;
  /** Probability of each paying tier, keyed by hits. */
  tierProbs: { hits: number; multiplier: number; prob: number }[];
}

/**
 * Evaluate an entry with per-pick probabilities and arbitrary payout tiers.
 * Works for all-or-nothing entries (one tier at hits = picks) and flex
 * entries (several tiers). Payout rules are passed in, never hard-coded,
 * so they can be updated without changing this engine.
 */
export function evaluateEntry(pickProbs: number[], tiers: FlexTier[]): EntryEvaluation {
  if (tiers.length === 0) throw new Error("Need at least one payout tier");
  const distribution = hitCountDistribution(pickProbs);
  for (const tier of tiers) {
    if (!Number.isInteger(tier.hits) || tier.hits < 0 || tier.hits > pickProbs.length) {
      throw new Error(`Tier hits ${tier.hits} is outside 0..${pickProbs.length}`);
    }
    if (tier.multiplier < 0) throw new Error("Tier multiplier cannot be negative");
  }
  const expectedPayout = tiers.reduce(
    (sum, tier) => sum + distribution[tier.hits] * tier.multiplier,
    0,
  );
  return {
    distribution,
    allHitProb: distribution[pickProbs.length],
    expectedPayout,
    expectedReturn: expectedPayout - 1,
    tierProbs: tiers.map((tier) => ({
      hits: tier.hits,
      multiplier: tier.multiplier,
      prob: distribution[tier.hits],
    })),
  };
}

export interface ExchangeEvaluation {
  /** Probability needed to break even at this price, fees included. */
  breakEvenProb: number;
  /** fairProb - breakEvenProb, in decimal (not percentage points). */
  edge: number;
  /** Expected profit per contract (contract pays 1 unit when it settles yes). */
  expectedProfit: number;
  /** Expected profit divided by total cost. */
  feeAdjustedReturn: number;
}

/**
 * Evaluate an exchange-style contract (price in cents on the dollar).
 * Value is always computed from the price actually available, plus fees —
 * never from the midpoint alone.
 */
export function evaluateExchangeContract(
  priceCents: number,
  feeCents: number,
  fairProb: number,
): ExchangeEvaluation {
  if (priceCents <= 0 || priceCents >= 100) {
    throw new Error("Contract price must be between 0 and 100 cents");
  }
  if (feeCents < 0) throw new Error("Fees cannot be negative");
  assertProb(fairProb);
  const cost = (priceCents + feeCents) / 100;
  if (cost >= 1) {
    throw new Error("Price plus fees must stay under 100 cents");
  }
  const breakEvenProb = cost;
  const expectedProfit = fairProb * 1 - cost;
  return {
    breakEvenProb,
    edge: fairProb - breakEvenProb,
    expectedProfit,
    feeAdjustedReturn: expectedProfit / cost,
  };
}

function assertProb(p: number): void {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    throw new Error(`Probability must be strictly between 0 and 1, got ${p}`);
  }
}
