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

// ---- Novig make/take orders ----
//
// Novig is an exchange: a "take" order accepts an existing price and fills
// instantly; a "make" order posts your own price and waits for another
// user to accept the mirrored other side (make Mets -120 ⇢ waits for a
// Yankees +120 taker). Matching is zero-vig: the two sides' prices mirror.

/**
 * The counterparty price implied by a make order: the exact opposite
 * American odds (-120 ⇢ +120). ±100 mirrors to ∓100 (both are 50%).
 */
export function mirrorAmerican(american: number): number {
  if (!Number.isFinite(american) || Math.abs(american) < 100) {
    throw new Error(`American odds must be <= -100 or >= +100, got ${american}`);
  }
  return -american;
}

export interface MakeOrderEvaluation {
  /** Break-even probability at your posted price. */
  breakEvenProb: number;
  /** Your estimated edge in probability points (fair − break-even) × 100. */
  edgePts: number;
  /** Expected profit per $1 staked at your price, given the fair prob. */
  evPerDollar: number;
  /** The price the other side must take for your order to fill. */
  counterpartyOdds: number;
  /** Break-even probability for the taker of the other side. */
  counterpartyBreakEvenProb: number;
  /** The taker's estimated edge (positive = your order gives value away). */
  counterpartyEdgePts: number;
  /** Plain-language fill outlook derived from the counterparty's edge. */
  fillOutlook: "fills fast" | "reasonable" | "unlikely";
}

/**
 * Evaluate a Novig make order at `yourOdds` for a side whose fair
 * probability (from the multi-book no-vig consensus) is `fairProb`.
 */
export function evaluateMakeOrder(fairProb: number, yourOdds: number): MakeOrderEvaluation {
  assertProb(fairProb);
  const breakEvenProb = americanToImpliedProb(yourOdds);
  const edgePts = (fairProb - breakEvenProb) * 100;
  const evPerDollar = fairProb * americanToDecimal(yourOdds) - 1;
  const counterpartyOdds = mirrorAmerican(yourOdds);
  const counterpartyBreakEvenProb = americanToImpliedProb(counterpartyOdds);
  const counterpartyEdgePts = ((1 - fairProb) - counterpartyBreakEvenProb) * 100;
  const fillOutlook: MakeOrderEvaluation["fillOutlook"] =
    counterpartyEdgePts >= 0 ? "fills fast" : counterpartyEdgePts >= -1.5 ? "reasonable" : "unlikely";
  return {
    breakEvenProb,
    edgePts,
    evPerDollar,
    counterpartyOdds,
    counterpartyBreakEvenProb,
    counterpartyEdgePts,
    fillOutlook,
  };
}

/**
 * Novig tick schedule. Make orders are only accepted at approved price
 * increments; increments are smaller near even money and larger for long
 * shots / heavy favorites (per Novig's published structure — their own
 * examples: -110/-115/-120 are valid, -111/-113 are not).
 *
 * APPROXIMATION NOTE: Novig's exact tick-table article
 * (support.novig.us/…/tick-table) is the source of truth. The bands
 * below follow the published structure and confirmed examples; correct
 * them here if the table differs.
 */
export const NOVIG_TICK_BANDS: { maxAbs: number; tick: number }[] = [
  { maxAbs: 199, tick: 5 },
  { maxAbs: 299, tick: 10 },
  { maxAbs: 499, tick: 25 },
  { maxAbs: 999, tick: 50 },
  { maxAbs: Number.POSITIVE_INFINITY, tick: 100 },
];

/** Tick size at a given absolute American-odds level. */
export function tickSizeFor(american: number): number {
  const abs = Math.abs(american);
  for (const band of NOVIG_TICK_BANDS) {
    if (abs <= band.maxAbs) return band.tick;
  }
  return NOVIG_TICK_BANDS[NOVIG_TICK_BANDS.length - 1].tick;
}

/**
 * Is this an approved make-order price? |odds| must be >= 100, land on
 * its band's tick, and -100 is expressed as +100 (both are 50%).
 */
export function isValidTickPrice(american: number): boolean {
  if (!Number.isInteger(american)) return false;
  if (american === -100) return false; // canonical form is +100
  const abs = Math.abs(american);
  if (abs < 100) return false;
  return abs % tickSizeFor(american) === 0;
}

/**
 * The next approved price in your favor (higher payout for you): for a
 * favorite price the ladder shrinks toward -105 then crosses to +100;
 * for a dog price it climbs. Band boundaries switch tick size correctly
 * (…-310, -300, -290… and …195, 200, 210…).
 */
export function nextTickUp(american: number): number {
  let odds = american === -100 ? 100 : american;
  if (odds < 0) {
    const abs = -odds;
    if (abs <= 105) return 100; // -105 → +100 (skip -100)
    const next = abs - tickSizeFor(abs - 1);
    return -Math.max(next, 100) === -100 ? 100 : -next;
  }
  return odds + tickSizeFor(odds + 1);
}

/** Snap toward a better-for-you approved price (returns input if valid). */
export function snapToTick(american: number): number {
  if (american === -100) return 100;
  if (isValidTickPrice(american)) return american;
  const abs = Math.abs(american);
  if (abs < 100) return 100;
  const tick = tickSizeFor(american);
  if (american < 0) {
    const snapped = -Math.floor(abs / tick) * tick; // toward -100 (better for you)
    return snapped === -100 ? 100 : snapped;
  }
  return Math.ceil(abs / tick) * tick; // toward higher payout
}

/**
 * Step American odds by `steps` approved ticks in your favor (higher
 * payout). Invalid starting prices are first snapped toward you. There
 * are no prices between -100 and +100.
 */
export function stepAmerican(american: number, steps: number): number {
  let odds = snapToTick(american);
  for (let i = 0; i < steps; i++) odds = nextTickUp(odds);
  return odds;
}

export interface MakeLadderRung {
  odds: number;
  evaluation: MakeOrderEvaluation;
}

/**
 * A ladder of candidate make prices, starting at the current take price
 * (rung 0 = just take it) and improving in five-point increments. Each
 * rung shows your edge and how attractive the mirrored side is to a
 * taker. NOTE: Novig only accepts approved price increments — verify a
 * chosen price is valid in the Novig app before posting.
 */
export function makeOrderLadder(fairProb: number, takeOdds: number, rungs = 5): MakeLadderRung[] {
  const out: MakeLadderRung[] = [];
  // Rung 0 is the take itself — any displayed price, tick-valid or not.
  out.push({ odds: takeOdds, evaluation: evaluateMakeOrder(fairProb, takeOdds) });
  // Later rungs walk the approved tick ladder, strictly better than the take.
  let odds = snapToTick(takeOdds);
  if (odds === takeOdds) odds = nextTickUp(odds);
  for (let i = 1; i < rungs; i++) {
    out.push({ odds, evaluation: evaluateMakeOrder(fairProb, odds) });
    odds = nextTickUp(odds);
  }
  return out;
}
