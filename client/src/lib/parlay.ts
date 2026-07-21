/**
 * Parlay builder state (module-level store, subscribed via
 * useSyncExternalStore) and the combined-entry math. Legs are assumed
 * independent; same-event legs trigger a correlation warning instead of a
 * pretend adjustment.
 */
import { useSyncExternalStore } from "react";
import { americanToDecimal, decimalToAmerican } from "@shared/odds";
import type { Opportunity } from "@shared/types";

export interface ParlayLeg {
  id: string;
  label: string;
  eventName: string;
  platform: string;
  oddsAmerican: number;
  fairProb: number;
  market: string;
  side: string;
}

let legs: ParlayLeg[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function addLeg(o: Opportunity): void {
  if (o.offeredOdds == null) return;
  if (legs.some((l) => l.id === o.id)) return;
  const fairProb =
    o.sideFairProb ?? (o.side === "Under" ? 1 - o.consensus.fairProb : o.consensus.fairProb);
  legs = [
    ...legs,
    {
      id: o.id,
      label: `${o.player ?? o.eventName} — ${o.market} ${o.side}${o.line ? ` ${o.line}` : ""}`,
      eventName: o.eventName,
      platform: o.platform,
      oddsAmerican: o.offeredOdds,
      fairProb,
      market: o.market,
      side: o.side,
    },
  ];
  emit();
}

export function removeLeg(id: string): void {
  legs = legs.filter((l) => l.id !== id);
  emit();
}

export function clearLegs(): void {
  legs = [];
  emit();
}

export function useParlayLegs(): ParlayLeg[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => legs,
  );
}

export interface ParlayMath {
  combinedDecimal: number;
  combinedAmerican: number;
  combinedFairProb: number;
  breakEvenProb: number;
  edgePts: number;
  evPerDollar: number;
  warnings: string[];
}

export function computeParlay(current: ParlayLeg[]): ParlayMath | null {
  if (current.length === 0) return null;
  let combinedDecimal = 1;
  let combinedFairProb = 1;
  for (const leg of current) {
    try {
      combinedDecimal *= americanToDecimal(leg.oddsAmerican);
    } catch {
      return null;
    }
    combinedFairProb *= leg.fairProb;
  }
  const breakEvenProb = 1 / combinedDecimal;
  const warnings: string[] = [];
  if (current.length >= 3) {
    warnings.push("3+ legs — your logged 3+ leg record is heavily negative. Two legs has been your ceiling.");
  }
  const dogMl = current.find((l) => l.market === "Moneyline" && l.oddsAmerican >= -120);
  if (dogMl) {
    warnings.push("Contains a dog/near-even moneyline — 0 wins in your logged history for this shape.");
  }
  const eventCounts = new Map<string, number>();
  for (const leg of current) eventCounts.set(leg.eventName, (eventCounts.get(leg.eventName) ?? 0) + 1);
  if (Array.from(eventCounts.values()).some((n) => n > 1)) {
    warnings.push(
      "Two legs share a game — outcomes are correlated, and this math assumes independence. Treat the combined probability as approximate.",
    );
  }
  return {
    combinedDecimal,
    combinedAmerican: combinedDecimal > 1 ? decimalToAmerican(combinedDecimal) : 0,
    combinedFairProb,
    breakEvenProb,
    edgePts: (combinedFairProb - breakEvenProb) * 100,
    evPerDollar: combinedFairProb * combinedDecimal - 1,
    warnings,
  };
}

/** Map a market label + side to the journal's market enum. */
export function journalMarket(market: string, side: string): string {
  if (market === "Moneyline") return "moneyline";
  if (market === "Game total points") return side === "Under" ? "total_under" : "total_over";
  if (market === "Pitcher strikeouts") return "pitcher_ks";
  if (market === "Pitcher outs recorded") return "pitcher_outs";
  if (market === "Earned runs allowed") return "pitcher_er";
  if (market === "Pitcher walks" || market === "Hits allowed") return "other";
  if (["Hits", "Total bases", "Home runs", "RBIs", "Batter walks", "Stolen bases", "Batter strikeouts"].includes(market)) {
    return "batter_prop";
  }
  return "other";
}
