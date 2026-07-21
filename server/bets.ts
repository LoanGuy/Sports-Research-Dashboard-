/**
 * Bet journal: storage, leak flags, and category analytics.
 *
 * The journal exists to replace feelings with numbers: every ticket (wins
 * AND losses) is logged, and hit rates/ROI are computed per category with
 * the sample size always attached. Flags encode the leaks identified from
 * the user's own ticket history (2026-07-16..19 analysis):
 *   - "dog/near-even moneyline": ML legs at -120 or lighter went 0-4
 *   - "3+ legs": the only pure-pitching loss was a 3-legger
 */
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { bets, type Bet } from "@shared/schema";
import { getDb } from "./db";

export const legSchema = z.object({
  description: z.string().min(1),
  market: z.enum([
    "total_under",
    "total_over",
    "pitcher_outs",
    "pitcher_ks",
    "pitcher_er",
    "batter_prop",
    "moneyline",
    "spread",
    "other",
  ]),
  oddsAmerican: z.number().nullable().optional(),
  line: z.number().nullable().optional(),
  result: z.enum(["won", "lost", "push", "pending"]).default("pending"),
});

export const betInputSchema = z.object({
  placedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  platform: z.string().min(1).default("other"),
  betType: z.enum(["straight", "parlay", "sgp"]),
  oddsAmerican: z.number().nullable().optional(),
  stake: z.number().positive(),
  payout: z.number().min(0).default(0),
  result: z.enum(["won", "lost", "push", "pending"]).default("pending"),
  boostPct: z.number().min(0).max(200).nullable().optional(),
  bonusBet: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  legs: z.array(legSchema).min(1),
});

export type BetInput = z.infer<typeof betInputSchema>;
export type BetLeg = z.infer<typeof legSchema>;

const PITCHING_MARKETS = new Set(["total_under", "total_over", "pitcher_outs", "pitcher_ks", "pitcher_er"]);

/** Leak flags derived from the user's own win/loss history. */
export function betFlags(legs: BetLeg[]): string[] {
  const flags: string[] = [];
  if (legs.length >= 3) flags.push("3+ legs");
  for (const leg of legs) {
    if (leg.market === "moneyline" && leg.oddsAmerican != null && leg.oddsAmerican >= -120) {
      flags.push("dog/near-even moneyline");
      break;
    }
  }
  return flags;
}

export function isPurePitching(legs: BetLeg[]): boolean {
  return legs.every(
    (leg) =>
      PITCHING_MARKETS.has(leg.market) ||
      (leg.market === "moneyline" && leg.oddsAmerican != null && leg.oddsAmerican <= -150),
  );
}

interface CategoryRecord {
  label: string;
  count: number;
  wins: number;
  losses: number;
  pending: number;
  cashStaked: number;
  cashProfit: number;
}

export interface JournalSummary {
  overall: CategoryRecord;
  byBetType: CategoryRecord[];
  byLegCount: CategoryRecord[];
  byFlags: CategoryRecord[];
  byFamily: CategoryRecord[];
}

function newRecord(label: string): CategoryRecord {
  return { label, count: 0, wins: 0, losses: 0, pending: 0, cashStaked: 0, cashProfit: 0 };
}

function addTo(record: CategoryRecord, bet: Bet): void {
  const cashStake = bet.bonusBet ? 0 : bet.stake;
  record.count++;
  record.cashStaked += cashStake;
  if (bet.result === "won") {
    record.wins++;
    record.cashProfit += bet.payout - cashStake;
  } else if (bet.result === "lost") {
    record.losses++;
    record.cashProfit -= cashStake;
  } else if (bet.result === "pending") {
    record.pending++;
  }
}

export function summarize(rows: Bet[]): JournalSummary {
  const overall = newRecord("All bets");
  const byType = new Map<string, CategoryRecord>();
  const byLegs = new Map<string, CategoryRecord>();
  const byFlags = new Map<string, CategoryRecord>();
  const byFamily = new Map<string, CategoryRecord>();

  for (const bet of rows) {
    const legs = (bet.legs as BetLeg[]) ?? [];
    addTo(overall, bet);

    const typeLabel = bet.betType === "straight" ? "Straight" : bet.betType === "sgp" ? "Same-game parlay" : "Parlay";
    if (!byType.has(typeLabel)) byType.set(typeLabel, newRecord(typeLabel));
    addTo(byType.get(typeLabel)!, bet);

    const legLabel = bet.legCount === 1 ? "1 leg" : bet.legCount === 2 ? "2 legs" : "3+ legs";
    if (!byLegs.has(legLabel)) byLegs.set(legLabel, newRecord(legLabel));
    addTo(byLegs.get(legLabel)!, bet);

    const flags = betFlags(legs);
    const flagLabel = flags.length === 0 ? "No leak flags" : flags.join(" + ");
    if (!byFlags.has(flagLabel)) byFlags.set(flagLabel, newRecord(flagLabel));
    addTo(byFlags.get(flagLabel)!, bet);

    const family = isPurePitching(legs)
      ? "Pitching outcomes only"
      : legs.some((l) => l.market === "moneyline")
        ? "Contains moneyline"
        : "Mixed/other";
    if (!byFamily.has(family)) byFamily.set(family, newRecord(family));
    addTo(byFamily.get(family)!, bet);
  }

  const sorted = (m: Map<string, CategoryRecord>) => Array.from(m.values()).sort((a, b) => b.count - a.count);
  return { overall, byBetType: sorted(byType), byLegCount: sorted(byLegs), byFlags: sorted(byFlags), byFamily: sorted(byFamily) };
}

export async function listBets(): Promise<{ bets: (Bet & { flags: string[] })[]; summary: JournalSummary }> {
  const db = getDb();
  const rows = await db.select().from(bets).orderBy(desc(bets.placedOn), desc(bets.id));
  return {
    bets: rows.map((b) => ({ ...b, flags: betFlags((b.legs as BetLeg[]) ?? []) })),
    summary: summarize(rows),
  };
}

export async function createBet(input: BetInput): Promise<Bet> {
  const db = getDb();
  const inserted = await db
    .insert(bets)
    .values({
      placedOn: input.placedOn ?? null,
      platform: input.platform,
      betType: input.betType,
      legCount: input.legs.length,
      oddsAmerican: input.oddsAmerican ?? null,
      stake: input.stake,
      payout: input.payout,
      result: input.result,
      boostPct: input.boostPct ?? null,
      bonusBet: input.bonusBet,
      notes: input.notes ?? null,
      legs: input.legs,
    })
    .returning();
  return inserted[0];
}

export async function updateBet(id: number, patch: Partial<BetInput>): Promise<Bet | null> {
  const db = getDb();
  const updates: Record<string, unknown> = {};
  if (patch.result !== undefined) updates.result = patch.result;
  if (patch.payout !== undefined) updates.payout = patch.payout;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.placedOn !== undefined) updates.placedOn = patch.placedOn;
  if (patch.platform !== undefined) updates.platform = patch.platform;
  if (patch.legs !== undefined) {
    updates.legs = patch.legs;
    updates.legCount = patch.legs.length;
  }
  if (Object.keys(updates).length === 0) {
    const existing = await db.select().from(bets).where(eq(bets.id, id)).limit(1);
    return existing[0] ?? null;
  }
  const updated = await db.update(bets).set(updates).where(eq(bets.id, id)).returning();
  return updated[0] ?? null;
}

export async function deleteBet(id: number): Promise<void> {
  await getDb().delete(bets).where(eq(bets.id, id));
}

/**
 * The 15 tickets analyzed in chat (2026-07-16..19 window). Idempotent:
 * only inserts when the journal is empty. Hard Rock tickets did not show
 * dates on their screenshots — those are null with a note.
 */
export async function seedInitialBets(): Promise<{ seeded: number; message: string }> {
  const db = getDb();
  const existing = await db.select({ id: bets.id }).from(bets).limit(1);
  if (existing.length > 0) {
    return { seeded: 0, message: "Journal already has entries — seed skipped." };
  }

  const leg = (description: string, market: BetLeg["market"], result: BetLeg["result"], oddsAmerican?: number | null, line?: number | null): BetLeg => ({
    description,
    market,
    result,
    oddsAmerican: oddsAmerican ?? null,
    line: line ?? null,
  });

  const seed: BetInput[] = [
    {
      placedOn: "2026-07-16", platform: "sweeps", betType: "sgp", oddsAmerican: 129, stake: 100, payout: 228.83, result: "won", bonusBet: false,
      notes: "First game after the All-Star break (NYM@PHI).",
      legs: [leg("Christian Scott Over 4.5 strikeouts", "pitcher_ks", "won", null, 4.5), leg("Aaron Nola Over 4.5 strikeouts", "pitcher_ks", "won", null, 4.5)],
    },
    {
      placedOn: "2026-07-17", platform: "sweeps", betType: "straight", oddsAmerican: -130, stake: 200, payout: 353.98, result: "won", bonusBet: false,
      notes: "LAD@NYY final 2-1. Sasaki vs Cole, both rested post-break.",
      legs: [leg("Under 9.5 total runs (LAD@NYY)", "total_under", "won", -130, 9.5)],
    },
    {
      placedOn: "2026-07-17", platform: "sweeps", betType: "straight", oddsAmerican: -120, stake: 103.83, payout: 190.51, result: "won", bonusBet: false,
      notes: "SF@SEA final 7-0 — landed half a run under the line.",
      legs: [leg("Under 7.5 total runs (SF@SEA)", "total_under", "won", -120, 7.5)],
    },
    {
      placedOn: "2026-07-18", platform: "sweeps", betType: "straight", oddsAmerican: 113, stake: 150, payout: 319.14, result: "won", bonusBet: false,
      notes: "BAL@HOU 4-2 in 11 innings; regulation ended 2-2. Roofed park.",
      legs: [leg("Under 8.5 total runs (BAL@HOU)", "total_under", "won", 113, 8.5)],
    },
    {
      placedOn: "2026-07-19", platform: "sweeps", betType: "parlay", oddsAmerican: 142, stake: 100, payout: 242.13, result: "won", bonusBet: false,
      notes: "Yamamoto threw a complete game (27 outs). Gray cleared by half an out.",
      legs: [leg("Yoshinobu Yamamoto Over 17.5 outs", "pitcher_outs", "won", null, 17.5), leg("Sonny Gray Over 17.5 outs", "pitcher_outs", "won", null, 17.5)],
    },
    {
      placedOn: "2026-07-19", platform: "sweeps", betType: "parlay", oddsAmerican: 190, stake: 25, payout: 0, result: "lost", bonusBet: false,
      notes: "Houston lost 5-2 to streaking Baltimore. The ML leg died.",
      legs: [leg("Astros moneyline (BAL@HOU)", "moneyline", "lost"), leg("Mariners moneyline (SF@SEA)", "moneyline", "won")],
    },
    {
      placedOn: "2026-07-19", platform: "sweeps", betType: "parlay", oddsAmerican: 182, stake: 39.14, payout: 0, result: "lost", bonusBet: false,
      notes: "Eovaldi managed 2 Ks chasing his prior 9-K start. 2 of 3 legs hit and it still lost.",
      legs: [leg("Nathan Eovaldi Over 5.5 strikeouts", "pitcher_ks", "lost", null, 5.5), leg("Paul Skenes Over 5.5 strikeouts", "pitcher_ks", "won", null, 5.5), leg("Casey Mize Over 4.5 strikeouts", "pitcher_ks", "won", null, 4.5)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 269, stake: 25, payout: 0, result: "lost", bonusBet: false,
      notes: "Date not shown on ticket. Marlins +105 (the dog leg) died.",
      legs: [leg("Marlins moneyline (MIA@HOU)", "moneyline", "lost", 105), leg("Nationals moneyline (WSH@COL)", "moneyline", "won", -125)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 258, stake: 10, payout: 0, result: "lost", bonusBet: true,
      notes: "Date not shown on ticket. $10 bonus bet. Dodgers +120 (the dog leg) died.",
      legs: [leg("Rays +1.5 (TB@TOR)", "spread", "won", -160, 1.5), leg("Dodgers moneyline (LAD@PHI)", "moneyline", "lost", 120)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 283, stake: 27.26, payout: 0, result: "lost", bonusBet: false,
      notes: "Date not shown on ticket. Astros -115 died vs streaking Baltimore.",
      legs: [leg("Braves moneyline (TEX@ATL)", "moneyline", "won", 105), leg("Astros moneyline (BAL@HOU)", "moneyline", "lost", -115)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "straight", oddsAmerican: -190, stake: 10, payout: 15.26, result: "won", bonusBet: false,
      notes: "Date not shown on ticket. Heavy favorite ML as a straight.",
      legs: [leg("Tigers moneyline (DET@LAA)", "moneyline", "won", -190)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "straight", oddsAmerican: 110, stake: 20, payout: 42, result: "won", bonusBet: false,
      notes: "Date not shown on ticket. Same BAL@HOU under also taken at +113 elsewhere — line shopping.",
      legs: [leg("Under 8.5 total runs (BAL@HOU)", "total_under", "won", 110, 8.5)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 750, stake: 40, payout: 429.99, result: "won", boostPct: 30, bonusBet: false,
      notes: "Date not shown on ticket. All-favorite legs + two independently validated unders + 30% boost.",
      legs: [
        leg("Under 9.5 total runs (LAD@NYY)", "total_under", "won", -135, 9.5),
        leg("Braves moneyline (TEX@ATL)", "moneyline", "won", -210),
        leg("Tigers moneyline (DET@LAA)", "moneyline", "won", -115),
        leg("Under 7.5 total runs (SF@SEA)", "total_under", "won", -130, 7.5),
      ],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 230, stake: 20, payout: 66, result: "won", bonusBet: false,
      notes: "Date not shown on ticket. Pitcher outcomes only.",
      legs: [leg("Michael McGreevy Over 16.5 outs (STL@ARI)", "pitcher_outs", "won", -120, 16.5), leg("Bryce Miller Over 1.5 earned runs (SF@SEA)", "pitcher_er", "won", -125, 1.5)],
    },
    {
      placedOn: null, platform: "hardrock", betType: "parlay", oddsAmerican: 224, stake: 30, payout: 117.5, result: "won", boostPct: 30, bonusBet: false,
      notes: "Date not shown on ticket. Under + K prop, 30% boost.",
      legs: [leg("Under 9.5 total runs (LAD@NYY)", "total_under", "won", -130, 9.5), leg("Troy Melton Over 5.5 strikeouts (DET@LAA)", "pitcher_ks", "won", -120, 5.5)],
    },
  ];

  for (const input of seed) {
    await createBet(betInputSchema.parse(input));
  }
  return { seeded: seed.length, message: `Seeded ${seed.length} analyzed tickets.` };
}
