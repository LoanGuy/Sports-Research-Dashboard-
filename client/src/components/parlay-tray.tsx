import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Layers, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { clearLegs, computeParlay, journalMarket, removeLeg, useParlayLegs } from "@/lib/parlay";
import { formatAmerican, formatProb, formatSignedPct } from "@/lib/format";
import { platformName } from "@/components/badges";
import { cn } from "@/lib/utils";

/**
 * Floating parlay builder. Combines selected legs with the shared odds
 * math, shows the user's own leak-flag warnings, and can log the ticket
 * to the journal as pending. It never places anything.
 */
export function ParlayTray() {
  const legs = useParlayLegs();
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState("10");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const math = computeParlay(legs);

  const save = useMutation({
    mutationFn: async () => {
      if (!math) return;
      const stakeNum = Number(stake) > 0 ? Number(stake) : 10;
      const platforms = Array.from(new Set(legs.map((l) => l.platform)));
      const events = new Set(legs.map((l) => l.eventName));
      await apiRequest("POST", "/api/bets", {
        placedOn: new Date().toISOString().slice(0, 10),
        platform: platforms.length === 1 ? platforms[0] : "other",
        betType: legs.length === 1 ? "straight" : events.size === 1 ? "sgp" : "parlay",
        oddsAmerican: legs.length > 0 ? Math.round(math.combinedAmerican) : null,
        stake: stakeNum,
        payout: 0,
        result: "pending",
        bonusBet: false,
        notes: "Logged from the parlay builder (pending — settle after the games).",
        legs: legs.map((l) => ({
          description: `${l.label} (${platformName(l.platform)} ${formatAmerican(l.oddsAmerican)})`,
          market: journalMarket(l.market, l.side),
          oddsAmerican: l.oddsAmerican,
          line: null,
          result: "pending",
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      setSavedMessage("Saved to your journal as pending. Settle it there after the games.");
      clearLegs();
    },
  });

  if (legs.length === 0 && !savedMessage) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-full max-w-xl px-3 md:bottom-4 md:max-w-md">
      {savedMessage && legs.length === 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-background px-4 py-3 shadow-lg">
          <p className="text-[13px] text-emerald-400">{savedMessage}</p>
          <button onClick={() => setSavedMessage(null)} aria-label="Dismiss">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : open ? (
        <div className="rounded-xl border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[14px] font-bold text-foreground">
              Parlay builder · {legs.length} leg{legs.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover-elevate"
                onClick={clearLegs}
              >
                Clear
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover-elevate"
                onClick={() => setOpen(false)}
                aria-label="Minimize"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ul className="max-h-44 space-y-1.5 overflow-y-auto px-4 py-2.5">
            {legs.map((leg) => (
              <li key={leg.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate text-foreground">
                  {leg.label}
                  <span className="ml-1 text-muted-foreground">
                    {platformName(leg.platform)} {formatAmerican(leg.oddsAmerican)}
                  </span>
                </span>
                <button
                  onClick={() => removeLeg(leg.id)}
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                  aria-label={`Remove ${leg.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          {math ? (
            <div className="border-t border-border px-4 py-2.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[16px] font-bold tabular-nums text-foreground">
                    {formatAmerican(Math.round(math.combinedAmerican))}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Combined odds</div>
                </div>
                <div>
                  <div className="text-[16px] font-bold tabular-nums text-foreground">
                    {formatProb(math.combinedFairProb)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. hit chance</div>
                </div>
                <div>
                  <div
                    className={cn(
                      "text-[16px] font-bold tabular-nums",
                      math.evPerDollar > 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {formatSignedPct(math.evPerDollar)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected value</div>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                Needs {formatProb(math.breakEvenProb)} to break even · market estimates{" "}
                {formatProb(math.combinedFairProb)}
              </p>

              {math.warnings.map((w) => (
                <p key={w} className="mt-1.5 flex gap-1.5 text-[12px] leading-4 text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
                </p>
              ))}

              <div className="mt-2.5 flex gap-2">
                <Input
                  inputMode="decimal"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="h-10 w-24"
                  aria-label="Stake"
                />
                <Button className="h-10 flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Log to journal (pending)"}
                </Button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                This logs a research ticket. Nothing is placed anywhere.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-background px-4 py-3 shadow-lg hover-elevate"
          data-testid="button-parlay-tray"
        >
          <span className="flex items-center gap-2 text-[14px] font-bold text-foreground">
            <Layers className="h-4 w-4 text-primary" /> Parlay · {legs.length} leg{legs.length === 1 ? "" : "s"}
          </span>
          {math ? (
            <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
              {formatAmerican(Math.round(math.combinedAmerican))} ·{" "}
              <span className={math.evPerDollar > 0 ? "text-emerald-400" : "text-red-400"}>
                {formatSignedPct(math.evPerDollar)} EV
              </span>
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
