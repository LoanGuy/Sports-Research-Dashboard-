import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DISCLAIMER } from "@shared/types";
import { cn } from "@/lib/utils";

/** Default grading weights from the specification. */
const DEFAULT_WEIGHTS = [
  { key: "market", label: "Market value", value: 30 },
  { key: "matchup", label: "Matchup", value: 25 },
  { key: "form", label: "Recent form", value: 15 },
  { key: "conditions", label: "Conditions", value: 10 },
  { key: "data", label: "Data confidence", value: 15 },
  { key: "risk", label: "Risk adjustment", value: 5 },
];

const STORAGE_KEY = "grade-weights-v1";

function loadWeights(): typeof DEFAULT_WEIGHTS {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEIGHTS;
    const parsed = JSON.parse(raw) as { key: string; value: number }[];
    return DEFAULT_WEIGHTS.map((d) => ({
      ...d,
      value: parsed.find((p) => p.key === d.key)?.value ?? d.value,
    }));
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export default function AppSettingsPage() {
  const [weights, setWeights] = useState(loadWeights);

  useEffect(() => {
    // Storage can be unavailable in sandboxed embeds; weights still work in-memory.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(weights.map(({ key, value }) => ({ key, value }))),
      );
    } catch {
      // ignore
    }
  }, [weights]);

  const total = weights.reduce((sum, w) => sum + w.value, 0);

  return (
    <AppShell title="Settings">
      <div className="space-y-3 px-4 pt-3">
        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">Grading weights</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            How much each category counts toward an overall grade. In this mockup the sample grades
            are pre-computed; weights apply to live grading in a later phase.
          </p>

          <div className="mt-4 space-y-4">
            {weights.map((w, i) => (
              <div key={w.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-medium text-foreground">{w.label}</span>
                  <span className="text-[14px] font-semibold tabular-nums text-foreground">{w.value}%</span>
                </div>
                <Slider
                  className="mt-2"
                  value={[w.value]}
                  min={0}
                  max={60}
                  step={5}
                  onValueChange={([value]) =>
                    setWeights((prev) => prev.map((p, j) => (j === i ? { ...p, value } : p)))
                  }
                  aria-label={`${w.label} weight`}
                />
              </div>
            ))}
          </div>

          <div
            className={cn(
              "mt-4 rounded-lg px-3 py-2 text-[13px] font-medium",
              total === 100
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400",
            )}
          >
            Total: {total}%{total !== 100 ? " — weights should add up to 100%" : ""}
          </div>

          <Button
            variant="secondary"
            className="mt-3 h-11 w-full"
            onClick={() => setWeights(DEFAULT_WEIGHTS)}
            data-testid="button-reset-weights"
          >
            Reset to defaults
          </Button>
        </section>

        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">About this dashboard</h2>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{DISCLAIMER}</p>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            This is the Phase 1 clickable mockup. All players, odds, projections, weather, and live
            scores are fictional sample data. It never places bets, logs into betting accounts,
            submits entries, or chooses a wager. The user makes every decision.
          </p>
        </section>

        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <h2 className="text-[15px] font-bold text-foreground">Planned for later phases</h2>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-[13px] text-muted-foreground">
            <li>Live data collection with provider comparison (see docs/provider-comparison.md)</li>
            <li>Event and market matching with normalization</li>
            <li>Automatic no-vig consensus from live feeds</li>
            <li>National Weather Service integration</li>
            <li>Lineup confirmation alerts and grade recalculation</li>
            <li>History, audit records, and data-quality monitoring</li>
            <li>Authentication and multi-device sync</li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
