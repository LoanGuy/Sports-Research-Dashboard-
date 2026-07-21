import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatAmerican } from "@/lib/format";

interface BetLeg {
  description: string;
  market: string;
  oddsAmerican?: number | null;
  line?: number | null;
  result: "won" | "lost" | "push" | "pending";
}

interface Bet {
  id: number;
  placedOn: string | null;
  platform: string;
  betType: string;
  legCount: number;
  oddsAmerican: number | null;
  stake: number;
  payout: number;
  result: string;
  boostPct: number | null;
  bonusBet: boolean;
  notes: string | null;
  legs: BetLeg[];
  flags: string[];
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

interface JournalData {
  bets: Bet[];
  summary: {
    overall: CategoryRecord;
    byPlatform: CategoryRecord[];
    byBetType: CategoryRecord[];
    byLegCount: CategoryRecord[];
    byFlags: CategoryRecord[];
    byFamily: CategoryRecord[];
  };
}

const MARKET_OPTIONS = [
  { value: "total_under", label: "Total — Under" },
  { value: "total_over", label: "Total — Over" },
  { value: "pitcher_outs", label: "Pitcher outs" },
  { value: "pitcher_ks", label: "Pitcher strikeouts" },
  { value: "pitcher_er", label: "Earned runs" },
  { value: "batter_prop", label: "Batter prop" },
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread / run line" },
  { value: "other", label: "Other" },
];

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function RecordTable({ title, rows }: { title: string; rows: CategoryRecord[] }) {
  return (
    <section className="rounded-xl border border-card-border bg-card px-4 py-3.5">
      <h2 className="text-[14px] font-bold text-foreground">{title}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Category</th>
              <th className="py-1 pr-2 font-medium">Record</th>
              <th className="py-1 pr-2 font-medium">Cash P/L</th>
              <th className="py-1 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const roi = r.cashStaked > 0 ? (r.cashProfit / r.cashStaked) * 100 : 0;
              return (
                <tr key={r.label} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-2 text-foreground">{r.label}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {r.wins}-{r.losses}
                    {r.pending > 0 ? ` (${r.pending} pending)` : ""}
                    <span className="ml-1 text-[11px] text-muted-foreground">of {r.count}</span>
                  </td>
                  <td className={cn("py-1.5 pr-2 font-semibold tabular-nums", r.cashProfit > 0 ? "text-emerald-400" : r.cashProfit < 0 ? "text-red-400" : "text-foreground")}>
                    {money(r.cashProfit)}
                  </td>
                  <td className={cn("py-1.5 font-semibold tabular-nums", roi > 0 ? "text-emerald-400" : roi < 0 ? "text-red-400" : "text-foreground")}>
                    {r.cashStaked > 0 ? `${roi.toFixed(0)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Small samples — treat percentages as direction, not proof.
      </p>
    </section>
  );
}

function emptyLeg(): BetLeg {
  return { description: "", market: "total_under", oddsAmerican: null, line: null, result: "won" };
}

function AddBetForm({ onDone }: { onDone: () => void }) {
  const [placedOn, setPlacedOn] = useState("");
  const [platform, setPlatform] = useState("hardrock");
  const [betType, setBetType] = useState("straight");
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");
  const [payout, setPayout] = useState("");
  const [result, setResult] = useState("won");
  const [bonusBet, setBonusBet] = useState(false);
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<BetLeg[]>([emptyLeg()]);

  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/bets", {
        placedOn: placedOn || null,
        platform,
        betType,
        oddsAmerican: odds.trim() === "" ? null : Number(odds),
        stake: Number(stake),
        payout: payout.trim() === "" ? 0 : Number(payout),
        result,
        bonusBet,
        notes: notes || null,
        legs: legs.map((l) => ({
          ...l,
          oddsAmerican: l.oddsAmerican ?? null,
          line: l.line ?? null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      onDone();
    },
  });

  const selectClass =
    "h-10 w-full rounded-md border border-border bg-card px-2 text-[14px] text-foreground";

  return (
    <section className="rounded-xl border border-card-border bg-card px-4 py-4">
      <h2 className="text-[15px] font-bold text-foreground">Log a ticket</h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Date placed</Label>
          <Input type="date" value={placedOn} onChange={(e) => setPlacedOn(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Platform</Label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectClass}>
            <option value="hardrock">Hard Rock</option>
            <option value="sweeps">Sweeps app</option>
            <option value="prizepicks">PrizePicks</option>
            <option value="novig">NoVig</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Type</Label>
          <select value={betType} onChange={(e) => setBetType(e.target.value)} className={selectClass}>
            <option value="straight">Straight</option>
            <option value="parlay">Parlay</option>
            <option value="sgp">Same-game parlay</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Result</Label>
          <select value={result} onChange={(e) => setResult(e.target.value)} className={selectClass}>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="push">Push</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Total odds (American)</Label>
          <Input inputMode="numeric" placeholder="+142" value={odds} onChange={(e) => setOdds(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Stake ($)</Label>
          <Input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Paid ($, 0 if lost)</Label>
          <Input inputMode="decimal" value={payout} onChange={(e) => setPayout(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Bonus bet?</Label>
          <select value={bonusBet ? "yes" : "no"} onChange={(e) => setBonusBet(e.target.value === "yes")} className={selectClass}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Label className="text-[12px] text-muted-foreground">Legs</Label>
        {legs.map((leg, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-border p-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <Input
              placeholder="e.g. Under 8.5 total runs (BAL@HOU)"
              value={leg.description}
              onChange={(e) => setLegs((prev) => prev.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)))}
              className="h-10 md:col-span-1"
            />
            <select
              value={leg.market}
              onChange={(e) => setLegs((prev) => prev.map((p, j) => (j === i ? { ...p, market: e.target.value } : p)))}
              className={selectClass}
            >
              {MARKET_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Input
              placeholder="Leg odds"
              inputMode="numeric"
              value={leg.oddsAmerican ?? ""}
              onChange={(e) =>
                setLegs((prev) => prev.map((p, j) => (j === i ? { ...p, oddsAmerican: e.target.value.trim() === "" ? null : Number(e.target.value) } : p)))
              }
              className="h-10"
            />
            <select
              value={leg.result}
              onChange={(e) => setLegs((prev) => prev.map((p, j) => (j === i ? { ...p, result: e.target.value as BetLeg["result"] } : p)))}
              className={selectClass}
            >
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="push">Push</option>
              <option value="pending">Pending</option>
            </select>
            <Button
              variant="ghost"
              className="h-10 w-10 p-0"
              onClick={() => setLegs((prev) => prev.filter((_, j) => j !== i))}
              disabled={legs.length === 1}
              aria-label="Remove leg"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button variant="secondary" className="h-9" onClick={() => setLegs((prev) => [...prev, emptyLeg()])}>
          <Plus className="mr-1 h-4 w-4" /> Add leg
        </Button>
      </div>

      <div className="mt-3 space-y-1">
        <Label className="text-[12px] text-muted-foreground">Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" className="h-10" />
      </div>

      {create.isError ? (
        <p className="mt-2 text-[13px] text-red-400">Could not save: {(create.error as Error).message}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button className="h-11 flex-1" onClick={() => create.mutate()} disabled={create.isPending || !stake || legs.some((l) => !l.description)}>
          {create.isPending ? "Saving…" : "Save ticket"}
        </Button>
        <Button variant="secondary" className="h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

export default function JournalPage() {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery<JournalData>({
    queryKey: ["/api/bets"],
    queryFn: async () => {
      const res = await fetch("/api/bets");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      return (await res.json()) as JournalData;
    },
    retry: false,
  });

  const seed = useMutation({
    mutationFn: async () => {
      await apiRequest("GET", "/api/bets/seed-initial");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bets"] }),
  });

  const seedPp = useMutation({
    mutationFn: async () => {
      await apiRequest("GET", "/api/bets/seed-prizepicks");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bets"] }),
  });

  const deleteBet = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bets/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bets"] }),
  });

  return (
    <AppShell title="Bet journal">
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-3">
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-4 text-muted-foreground">
          Log every ticket — wins and losses — so hit rates and ROI are real numbers, not feelings.
          Leak flags mark the patterns that have historically lost: dog/near-even moneylines and 3+
          leg parlays. This journal records decisions; it never places wagers.
        </p>

        {error ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[13px] text-amber-400">
            Journal unavailable: {(error as Error).message}. The journal needs the database
            (DATABASE_URL) to be configured.
          </p>
        ) : null}

        {data ? (
          <>
            {data.bets.length === 0 ? (
              <section className="rounded-xl border border-card-border bg-card px-4 py-4 text-center">
                <p className="text-[14px] text-foreground">The journal is empty.</p>
                <Button className="mt-3 h-11" onClick={() => seed.mutate()} disabled={seed.isPending} data-testid="button-seed">
                  {seed.isPending ? "Loading…" : "Load the 15 analyzed tickets (Jul 16–19)"}
                </Button>
              </section>
            ) : (
              <>
                <RecordTable title="Overall" rows={[data.summary.overall]} />
                <div className="grid gap-3 md:grid-cols-2">
                  <RecordTable title="By platform" rows={data.summary.byPlatform} />
                  <RecordTable title="By family" rows={data.summary.byFamily} />
                  <RecordTable title="By leak flags" rows={data.summary.byFlags} />
                  <RecordTable title="By bet type" rows={data.summary.byBetType} />
                  <RecordTable title="By leg count" rows={data.summary.byLegCount} />
                </div>
              </>
            )}

            {data.bets.length > 0 && !data.bets.some((b) => b.platform === "prizepicks") ? (
              <Button
                variant="secondary"
                className="h-11 w-full"
                onClick={() => seedPp.mutate()}
                disabled={seedPp.isPending}
                data-testid="button-seed-pp"
              >
                {seedPp.isPending ? "Loading…" : "Load the 16 PrizePicks entries (Nov 2025 – Jul 2026)"}
              </Button>
            ) : null}

            {showForm ? (
              <AddBetForm onDone={() => setShowForm(false)} />
            ) : (
              <Button className="h-11 w-full" onClick={() => setShowForm(true)} data-testid="button-add-bet">
                <Plus className="mr-1 h-4 w-4" /> Log a ticket
              </Button>
            )}

            <div className="space-y-2.5">
              {data.bets.map((bet) => (
                <div key={bet.id} className="rounded-xl border border-card-border bg-card px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-foreground">
                        {bet.betType === "straight" ? "Straight" : bet.betType === "sgp" ? "SGP" : `${bet.legCount}-leg parlay`}
                        {bet.oddsAmerican != null ? ` · ${formatAmerican(bet.oddsAmerican)}` : ""}
                        {bet.boostPct ? ` · ${bet.boostPct}% boost` : ""}
                        {bet.bonusBet ? " · bonus bet" : ""}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {bet.placedOn ?? "date unknown"} · {bet.platform} · ${bet.stake.toFixed(2)} →{" "}
                        {bet.result === "won" ? `$${bet.payout.toFixed(2)}` : bet.result}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[12px] font-bold",
                          bet.result === "won"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : bet.result === "lost"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-zinc-500/15 text-zinc-400",
                        )}
                      >
                        {bet.result.toUpperCase()}
                      </span>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover-elevate"
                        onClick={() => {
                          if (window.confirm("Delete this ticket from the journal?")) deleteBet.mutate(bet.id);
                        }}
                        aria-label="Delete ticket"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {bet.legs.map((leg, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-foreground">
                          {leg.description}
                          {leg.oddsAmerican != null ? (
                            <span className="ml-1 text-muted-foreground">{formatAmerican(leg.oddsAmerican)}</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[12px] font-semibold",
                            leg.result === "won" ? "text-emerald-400" : leg.result === "lost" ? "text-red-400" : "text-muted-foreground",
                          )}
                        >
                          {leg.result}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {bet.flags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bet.flags.map((flag) => (
                        <span key={flag} className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
                          <AlertTriangle className="h-3 w-3" aria-hidden /> {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {bet.notes ? <p className="mt-2 text-[12px] text-muted-foreground">{bet.notes}</p> : null}
                </div>
              ))}
            </div>
          </>
        ) : isLoading ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">Loading journal…</p>
        ) : null}
      </div>
    </AppShell>
  );
}
