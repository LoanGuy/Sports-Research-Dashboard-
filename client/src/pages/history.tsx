import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CheckCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatAmerican } from "@/lib/format";
import { platformName } from "@/components/badges";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AlertRow {
  id: number;
  kind: "edge" | "lineup";
  message: string;
  createdAt: string;
  readAt: string | null;
}

interface Snapshot {
  id: number;
  gameDate: string;
  surfacedAt: string;
  eventName: string;
  player: string | null;
  market: string;
  side: string;
  line: number | null;
  platform: string;
  offeredOdds: number | null;
  breakEvenProb: number | null;
  consensusProb: number | null;
  edgePts: number;
  grade: string;
  gradeBasis: string;
  settledResult: "won" | "lost" | "push" | "void" | null;
}

interface CalibrationRow {
  grade: string;
  surfaced: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  avgNeeded: number | null;
  avgMarket: number | null;
}

interface HistoryData {
  days: number;
  snapshots: Snapshot[];
  calibration: CalibrationRow[];
}

const basisLabels: Record<string, string> = {
  price: "price only",
  "price+trends": "price + trends",
  "price+verified": "price + verified logs",
};

/**
 * Alerts + opportunity history + calibration. Every surfaced card is
 * snapshotted at collection time; settling them (manually for now) builds
 * the honest record of whether the grades mean anything.
 */
export default function HistoryPage() {
  const alerts = useQuery<{ alerts: AlertRow[]; unread: number }>({
    queryKey: ["/api/alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load alerts");
      return res.json();
    },
  });

  const history = useQuery<HistoryData>({
    queryKey: ["/api/history"],
    queryFn: async () => {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load history");
      return res.json();
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/alerts/read", { method: "POST" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const settle = useMutation({
    mutationFn: async ({ id, result }: { id: number; result: Snapshot["settledResult"] }) => {
      await fetch(`/api/history/${id}/settle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/history"] }),
  });

  const calibration = history.data?.calibration ?? [];
  const anySettled = calibration.some((c) => c.settled > 0);

  return (
    <AppShell title="Alerts & history">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-3">
        {/* Alerts */}
        <section className="rounded-xl border border-card-border bg-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
              <BellRing className="h-4 w-4 text-amber-400" /> Alerts
              {alerts.data && alerts.data.unread > 0 ? (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                  {alerts.data.unread} new
                </span>
              ) : null}
            </h2>
            <Button
              variant="secondary"
              className="h-9"
              onClick={() => markRead.mutate()}
              disabled={!alerts.data || alerts.data.unread === 0 || markRead.isPending}
            >
              <CheckCheck className="mr-1 h-4 w-4" /> Mark read
            </Button>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            In-app feed only — alerts are written when a collection run finds a new edge of 2+
            points at your books, or a surfaced player is missing from the posted lineup.
          </p>
          {!alerts.data || alerts.data.alerts.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">No alerts yet. They appear after collection runs.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {alerts.data.alerts.slice(0, 20).map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex gap-2 rounded-lg border px-3 py-2 text-[13px] leading-snug",
                    a.readAt ? "border-border text-muted-foreground" : "border-amber-500/30 bg-amber-500/5 text-foreground",
                  )}
                >
                  {a.kind === "lineup" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                  ) : (
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  )}
                  <span>
                    {a.message}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Calibration */}
        <section className="rounded-xl border border-card-border bg-card px-4 py-3.5">
          <h2 className="text-[15px] font-bold text-foreground">Grade calibration</h2>
          <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
            The honest test: settled cards per grade vs. the win rate their prices required. Settle
            snapshots below after games finish. Small samples prove nothing — let this accumulate.
          </p>
          {calibration.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Nothing surfaced yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3">Grade</th>
                    <th className="py-1.5 pr-3">Surfaced</th>
                    <th className="py-1.5 pr-3">Settled</th>
                    <th className="py-1.5 pr-3">W-L-P</th>
                    <th className="py-1.5 pr-3">Hit rate</th>
                    <th className="py-1.5">Needed (avg)</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {calibration.map((c) => (
                    <tr key={c.grade} className="border-t border-border">
                      <td className="py-1.5 pr-3 font-bold">{c.grade}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.surfaced}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.settled}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {c.wins}-{c.losses}-{c.pushes}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {c.hitRate != null ? `${(c.hitRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {c.avgNeeded != null ? `${(c.avgNeeded * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!anySettled && calibration.length > 0 ? (
            <p className="mt-2 text-[12px] text-amber-400">
              Nothing settled yet — the grades are unproven until this table fills in.
            </p>
          ) : null}
        </section>

        {/* Snapshots */}
        <section className="rounded-xl border border-card-border bg-card px-4 py-3.5">
          <h2 className="text-[15px] font-bold text-foreground">
            Surfaced opportunities {history.data ? `· last ${history.data.days} days` : ""}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Every card the system surfaced, recorded at collection time. Settle each one after the
            game so the calibration table above means something.
          </p>
          {!history.data || history.data.snapshots.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">No snapshots yet — they record on each collection run.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {history.data.snapshots.slice(0, 50).map((s) => (
                <li key={s.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-semibold text-foreground">
                      {s.player ?? s.eventName}
                      <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{s.gameDate}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-400">
                      +{s.edgePts.toFixed(1)} pts · {s.grade}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {s.market} — {s.side}
                    {s.line ? ` ${s.line}` : ""}
                    {s.offeredOdds != null ? ` · ${formatAmerican(s.offeredOdds)}` : ""} ·{" "}
                    {platformName(s.platform)} · {basisLabels[s.gradeBasis] ?? s.gradeBasis}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {(["won", "lost", "push"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => settle.mutate({ id: s.id, result: s.settledResult === r ? null : r })}
                        className={cn(
                          "h-8 rounded-md border px-2.5 text-[12px] font-semibold capitalize",
                          s.settledResult === r
                            ? r === "won"
                              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                              : r === "lost"
                                ? "border-red-500/50 bg-red-500/15 text-red-400"
                                : "border-border bg-secondary text-foreground"
                            : "border-border text-muted-foreground hover-elevate",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                    {s.settledResult ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">settled</span>
                    ) : (
                      <span className="ml-1 text-[11px] text-muted-foreground">pending</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
