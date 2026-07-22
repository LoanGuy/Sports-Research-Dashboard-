import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DISCLAIMER } from "@shared/types";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type WeightKey = "market" | "matchup" | "form" | "conditions" | "data" | "risk";
type Weights = Record<WeightKey, number>;

const WEIGHT_LABELS: { key: WeightKey; label: string; graded: string }[] = [
  { key: "market", label: "Market value", graded: "graded from live odds" },
  { key: "matchup", label: "Matchup", graded: "graded from your uploaded trends (stats phase later)" },
  { key: "form", label: "Recent form", graded: "graded from your uploaded trends" },
  { key: "conditions", label: "Conditions", graded: "not graded yet — weather phase" },
  { key: "data", label: "Data confidence", graded: "graded from book count + disagreement" },
  { key: "risk", label: "Risk", graded: "not graded yet — risk model later" },
];

const DEFAULT_WEIGHTS: Weights = { market: 30, matchup: 25, form: 15, conditions: 10, data: 15, risk: 5 };

/**
 * Settings. Grading weights are stored server-side (app_settings) and are
 * read by the live opportunity builder — they genuinely change grading,
 * unlike the old localStorage-only sliders.
 */
export default function AppSettingsPage() {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const server = useQuery<{ weights: Weights; persisted: boolean }>({
    queryKey: ["/api/settings/weights"],
    queryFn: async () => {
      const res = await fetch("/api/settings/weights");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (server.data && !dirty) setWeights(server.data.weights);
  }, [server.data, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/weights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      return body.weights as Weights;
    },
    onSuccess: () => {
      setDirty(false);
      setMessage("Saved. Live grading now uses these weights — the Research feed reflects them on its next load.");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : String(e)),
  });

  const total = WEIGHT_LABELS.reduce((sum, w) => sum + weights[w.key], 0);

  return (
    <AppShell title="Settings">
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-3">
        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">Grading weights</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            How much each category counts toward the overall grade on live opportunities. Saved
            server-side and applied when the feed is built. Categories without real data behind
            them show as Incomplete and are never counted, whatever their weight.
          </p>

          <div className="mt-4 space-y-4">
            {WEIGHT_LABELS.map((w) => (
              <div key={w.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-[14px] font-medium text-foreground">
                    {w.label}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{w.graded}</span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">{weights[w.key]}%</span>
                </div>
                <Slider
                  className="mt-2"
                  value={[weights[w.key]]}
                  min={0}
                  max={60}
                  step={5}
                  onValueChange={([value]) => {
                    setWeights((prev) => ({ ...prev, [w.key]: value }));
                    setDirty(true);
                    setMessage(null);
                  }}
                  aria-label={`${w.label} weight`}
                />
              </div>
            ))}
          </div>

          <div
            className={cn(
              "mt-4 rounded-lg px-3 py-2 text-[13px] font-medium",
              total === 100 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400",
            )}
          >
            Total: {total}%{total !== 100 ? " — weights should add up to 100%" : ""}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="h-11" onClick={() => save.mutate()} disabled={save.isPending || !dirty} data-testid="button-save-weights">
              {save.isPending ? "Saving…" : "Save weights"}
            </Button>
            <Button
              variant="secondary"
              className="h-11"
              onClick={() => {
                setWeights(DEFAULT_WEIGHTS);
                setDirty(true);
              }}
              data-testid="button-reset-weights"
            >
              Reset to defaults
            </Button>
          </div>
          {message ? <p className="mt-2 text-[12px] text-muted-foreground">{message}</p> : null}
        </section>

        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">About this dashboard</h2>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{DISCLAIMER}</p>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            The Research feed runs on live collected odds (SportsGameOdds + The Odds API) with the
            vig removed per book. Grades currently reflect price versus the market consensus, data
            confidence, and any trends you upload — matchup, lineup, and weather analysis are not
            built yet. The Live college basketball screen is a demo with fictional games. This tool
            never places bets, logs into betting accounts, submits entries, or chooses a wager. The
            user makes every decision.
          </p>
        </section>

        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">Planned next</h2>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-[13px] text-muted-foreground">
            <li>Line movement from stored snapshots (open vs current)</li>
            <li>MLB confirmed lineups + probable pitchers (MLB Stats API)</li>
            <li>Verified recent form from game logs (beyond screenshot trends)</li>
            <li>National Weather Service + stadium database for Conditions grades</li>
            <li>PrizePicks projections and NoVig prices via a licensed feed (OpticOdds)</li>
            <li>Alerts, opportunity history, and grade calibration tracking</li>
            <li>Real college basketball live scores + foul monitor</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
