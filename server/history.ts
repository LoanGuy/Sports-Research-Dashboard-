/**
 * Opportunity history + calibration + in-app alerts.
 *
 * Every collection run snapshots the surfaced cards. Settling them (manual
 * for now, from the History page) builds the calibration record: did
 * A-grade cards win at the rate the market math implied? New qualifying
 * edges and lineup problems also write in-app alerts — a feed, not push.
 */
import { desc, eq, gte, isNull } from "drizzle-orm";
import { alerts, opportunitySnapshots, type Alert, type OpportunitySnapshot } from "@shared/schema";
import type { Opportunity } from "@shared/types";
import { getDb, isDbConfigured } from "./db";
import { todayEt } from "./trends";

const EDGE_ALERT_THRESHOLD_PTS = 2.0;

export function gradeBasisOf(o: Opportunity): string {
  const form = o.categories.find((c) => c.key === "form");
  const verified = form && form.grade !== "Incomplete" && form.note.includes("verified");
  const trendBacked = o.categories.some(
    (c) => (c.key === "form" || c.key === "matchup") && c.grade !== "Incomplete",
  );
  if (verified) return "price+verified";
  if (trendBacked) return "price+trends";
  return "price";
}

export interface SnapshotRunSummary {
  inserted: number;
  updated: number;
  alertsCreated: number;
}

/**
 * Record the currently surfaced opportunities. One snapshot per card per
 * game day; a price change updates the snapshot. Newly appearing edges at
 * or above the alert threshold create an in-app alert, as do surfaced
 * cards whose player is missing from the posted lineup.
 */
export async function snapshotOpportunities(opps: Opportunity[]): Promise<SnapshotRunSummary> {
  if (!isDbConfigured()) return { inserted: 0, updated: 0, alertsCreated: 0 };
  const db = getDb();
  const date = todayEt();
  let inserted = 0;
  let updated = 0;
  let alertsCreated = 0;

  for (const o of opps) {
    if (o.origin !== "live") continue;
    const key = `${date}|${o.id}`;
    const existing = await db
      .select({ id: opportunitySnapshots.id, offeredOdds: opportunitySnapshots.offeredOdds })
      .from(opportunitySnapshots)
      .where(eq(opportunitySnapshots.snapshotKey, key))
      .limit(1);

    const values = {
      snapshotKey: key,
      gameDate: date,
      surfacedAt: new Date(),
      eventId: null as number | null,
      eventName: o.eventName,
      player: o.player,
      market: o.market,
      side: o.side,
      line: o.line,
      platform: o.platform,
      offeredOdds: o.offeredOdds,
      consensusProb: o.sideFairProb ?? o.consensus.fairProb,
      breakEvenProb: o.breakEvenProb,
      edgePts: o.edgePts,
      grade: o.grade,
      gradeBasis: gradeBasisOf(o),
    };

    if (existing.length === 0) {
      await db.insert(opportunitySnapshots).values(values);
      inserted += 1;
      if (o.edgePts >= EDGE_ALERT_THRESHOLD_PTS) {
        await db.insert(alerts).values({
          kind: "edge",
          message: `${o.player ?? o.eventName}: ${o.market} — ${o.side}${o.line ? ` ${o.line}` : ""} at ${o.platform} is +${o.edgePts.toFixed(1)} pts vs the market consensus (${o.eventTime}).`,
          snapshotKey: key,
        });
        alertsCreated += 1;
      }
      if (o.lineupStatus === "not_in_lineup") {
        await db.insert(alerts).values({
          kind: "lineup",
          message: `${o.player ?? o.eventName} is NOT in the posted lineup but has a surfaced ${o.market} market — verify before considering it.`,
          snapshotKey: key,
        });
        alertsCreated += 1;
      }
    } else {
      await db
        .update(opportunitySnapshots)
        .set({
          offeredOdds: values.offeredOdds,
          consensusProb: values.consensusProb,
          breakEvenProb: values.breakEvenProb,
          edgePts: values.edgePts,
          grade: values.grade,
          gradeBasis: values.gradeBasis,
          surfacedAt: values.surfacedAt,
        })
        .where(eq(opportunitySnapshots.snapshotKey, key));
      updated += 1;
    }
  }
  return { inserted, updated, alertsCreated };
}

export async function listSnapshots(days = 14): Promise<OpportunitySnapshot[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  return db
    .select()
    .from(opportunitySnapshots)
    .where(gte(opportunitySnapshots.surfacedAt, cutoff))
    .orderBy(desc(opportunitySnapshots.surfacedAt));
}

export async function settleSnapshot(id: number, result: "won" | "lost" | "push" | "void" | null): Promise<void> {
  const db = getDb();
  await db
    .update(opportunitySnapshots)
    .set({ settledResult: result, settledAt: result ? new Date() : null })
    .where(eq(opportunitySnapshots.id, id));
}

export interface CalibrationRow {
  grade: string;
  surfaced: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null; // wins / (wins+losses)
  avgNeeded: number | null; // average break-even probability
  avgMarket: number | null; // average consensus probability for the side
}

/**
 * Calibration by grade: settled snapshots only. This is the honest test
 * of the whole system — an A grade should win more often than its
 * break-even requirement over a real sample.
 */
export function calibrate(snapshots: OpportunitySnapshot[]): CalibrationRow[] {
  const byGrade = new Map<string, OpportunitySnapshot[]>();
  for (const s of snapshots) {
    const list = byGrade.get(s.grade) ?? [];
    list.push(s);
    byGrade.set(s.grade, list);
  }
  const rows: CalibrationRow[] = [];
  for (const grade of ["A", "B", "C", "D"]) {
    const list = byGrade.get(grade) ?? [];
    if (list.length === 0) continue;
    const settled = list.filter((s) => s.settledResult && s.settledResult !== "void");
    const wins = settled.filter((s) => s.settledResult === "won").length;
    const losses = settled.filter((s) => s.settledResult === "lost").length;
    const pushes = settled.filter((s) => s.settledResult === "push").length;
    const decided = wins + losses;
    const avg = (vals: (number | null)[]): number | null => {
      const nums = vals.filter((v): v is number => v != null);
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    };
    rows.push({
      grade,
      surfaced: list.length,
      settled: settled.length,
      wins,
      losses,
      pushes,
      hitRate: decided > 0 ? wins / decided : null,
      avgNeeded: avg(list.map((s) => s.breakEvenProb)),
      avgMarket: avg(list.map((s) => s.consensusProb)),
    });
  }
  return rows;
}

// ---- Alerts ----

export async function listAlerts(limit = 50): Promise<{ alerts: Alert[]; unread: number }> {
  const db = getDb();
  const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(limit);
  const unreadRows = await db.select({ id: alerts.id }).from(alerts).where(isNull(alerts.readAt));
  return { alerts: rows, unread: unreadRows.length };
}

export async function markAlertsRead(): Promise<void> {
  const db = getDb();
  await db.update(alerts).set({ readAt: new Date() }).where(isNull(alerts.readAt));
}
