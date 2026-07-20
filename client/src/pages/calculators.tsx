import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatAmerican, formatProb, formatSignedPct } from "@/lib/format";
import {
  americanToDecimal,
  americanToImpliedProb,
  decimalToImpliedProb,
  equalPickBreakEven,
  evaluateEntry,
  evaluateExchangeContract,
  expectedValue,
  kelly,
  probToAmerican,
  probToDecimal,
  removeVig,
  type FlexTier,
} from "@/lib/odds";

function Field({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 text-[15px]"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ResultRow({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[14px] font-semibold tabular-nums text-foreground",
          tone === "good" && "text-emerald-400",
          tone === "bad" && "text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card px-4 py-3">
      <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function parseNum(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
}

/** Parse odds in the selected format into raw implied probability. */
function toImplied(value: string, format: "american" | "decimal"): number | null {
  const n = parseNum(value);
  if (n === null) return null;
  try {
    return format === "american" ? americanToImpliedProb(n) : decimalToImpliedProb(n);
  } catch {
    return null;
  }
}

function toDecimalOdds(value: string, format: "american" | "decimal"): number | null {
  const n = parseNum(value);
  if (n === null) return null;
  try {
    return format === "american" ? americanToDecimal(n) : n > 1 ? n : null;
  } catch {
    return null;
  }
}

function VigCalculator() {
  const [format, setFormat] = useState<"american" | "decimal">("american");
  const [sideA, setSideA] = useState("-110");
  const [sideB, setSideB] = useState("-110");
  const [draw, setDraw] = useState("");
  const [available, setAvailable] = useState("");

  const result = useMemo(() => {
    const rawA = toImplied(sideA, format);
    const rawB = toImplied(sideB, format);
    if (rawA === null || rawB === null) return null;
    const rawDraw = draw.trim() === "" ? null : toImplied(draw, format);
    if (draw.trim() !== "" && rawDraw === null) return null;

    const raws = rawDraw !== null ? [rawA, rawB, rawDraw] : [rawA, rawB];
    const { fairProbs, hold } = removeVig(raws);
    const fairA = fairProbs[0];

    const availDecimal =
      available.trim() === "" ? toDecimalOdds(sideA, format) : toDecimalOdds(available, format);
    if (availDecimal === null) return null;

    const breakEven = 1 / availDecimal;
    const ev = expectedValue(fairA, availDecimal);
    const k = kelly(fairA, availDecimal);

    return { raws, fairProbs, hold, fairA, availDecimal, breakEven, ev, k, threeWay: rawDraw !== null };
  }, [sideA, sideB, draw, available, format]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-[13px] text-muted-foreground">Odds format</span>
        <div className="flex gap-1">
          {(["american", "decimal"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                "h-9 rounded-md px-3 text-[13px] font-medium capitalize",
                format === f ? "bg-primary/15 text-foreground" : "text-muted-foreground hover-elevate",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Side A odds" value={sideA} onChange={setSideA} placeholder={format === "american" ? "-110" : "1.91"} />
        <Field label="Side B odds" value={sideB} onChange={setSideB} placeholder={format === "american" ? "-110" : "1.91"} />
        <Field label="Draw odds (optional)" value={draw} onChange={setDraw} placeholder="Three-way only" />
        <Field label="Your available price (optional)" value={available} onChange={setAvailable} placeholder="Defaults to Side A" />
      </div>

      {result ? (
        <>
          <ResultCard title="Market">
            <ResultRow label="Raw implied probability — Side A" value={formatProb(result.raws[0])} />
            <ResultRow label="Raw implied probability — Side B" value={formatProb(result.raws[1])} />
            {result.threeWay ? (
              <ResultRow label="Raw implied probability — Draw" value={formatProb(result.raws[2])} />
            ) : null}
            <ResultRow label="Sportsbook hold (vig)" value={formatProb(result.hold, 2)} />
          </ResultCard>

          <ResultCard title="Fair value — Side A">
            <ResultRow label="No-vig probability" value={formatProb(result.fairA)} />
            <ResultRow label="Fair American odds" value={formatAmerican(probToAmerican(result.fairA))} />
            <ResultRow label="Fair decimal odds" value={probToDecimal(result.fairA).toFixed(3)} />
          </ResultCard>

          <ResultCard title="Your price vs fair value (Side A)">
            <ResultRow label="Break-even probability at your price" value={formatProb(result.breakEven)} />
            <ResultRow
              label="Estimated difference"
              value={formatSignedPct(result.fairA - result.breakEven)}
              tone={result.fairA - result.breakEven > 0 ? "good" : "bad"}
            />
            <ResultRow
              label="Expected value per $1"
              value={formatSignedPct(result.ev)}
              tone={result.ev > 0 ? "good" : "bad"}
            />
            <ResultRow label="Full Kelly" value={formatProb(result.k.full)} />
            <ResultRow label="Half Kelly" value={formatProb(result.k.half)} />
            <ResultRow label="Quarter Kelly" value={formatProb(result.k.quarter)} />
          </ResultCard>
          <p className="text-[12px] leading-4 text-muted-foreground">
            Kelly figures are informational only. This tool does not recommend a stake size. If the
            two sides come from different sportsbooks, treat the result as a blended market estimate,
            not a normal no-vig calculation.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Enter valid odds for both sides to see results.
        </p>
      )}
    </div>
  );
}

/** Default flex payout tiers by pick count. Editable — these are assumptions, not official rules. */
function defaultFlexTiers(picks: number): { hits: number; mult: string }[] {
  const table: Record<number, [number, string][]> = {
    3: [[3, "2.25"], [2, "1.25"]],
    4: [[4, "6"], [3, "1.5"]],
    5: [[5, "10"], [4, "2"], [3, "0.4"]],
    6: [[6, "25"], [5, "2"], [4, "0.4"]],
  };
  const tiers = table[picks] ?? [[picks, "3"], [picks - 1, "1"]];
  return tiers.map(([hits, mult]) => ({ hits, mult }));
}

function EntryCalculator() {
  const [picks, setPicks] = useState(3);
  const [mode, setMode] = useState<"power" | "flex">("power");
  const [powerPayout, setPowerPayout] = useState("5");
  const [flexTiers, setFlexTiers] = useState(defaultFlexTiers(3));
  const [equalMode, setEqualMode] = useState(true);
  const [equalProb, setEqualProb] = useState("55");
  const [pickProbs, setPickProbs] = useState<string[]>(["55", "55", "55"]);
  const [correlated, setCorrelated] = useState(false);

  const setPickCount = (n: number) => {
    setPicks(n);
    setFlexTiers(defaultFlexTiers(n));
    setPickProbs((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("55");
      return next.slice(0, n);
    });
  };

  const result = useMemo(() => {
    const probs: number[] = [];
    for (let i = 0; i < picks; i++) {
      const raw = parseNum(equalMode ? equalProb : pickProbs[i]);
      if (raw === null || raw <= 0 || raw >= 100) return null;
      probs.push(raw / 100);
    }

    let tiers: FlexTier[];
    if (mode === "power") {
      const mult = parseNum(powerPayout);
      if (mult === null || mult <= 1) return null;
      tiers = [{ hits: picks, multiplier: mult }];
    } else {
      tiers = [];
      for (const t of flexTiers) {
        const mult = parseNum(t.mult);
        if (mult === null || mult < 0) return null;
        tiers.push({ hits: t.hits, multiplier: mult });
      }
    }

    try {
      const evaluation = evaluateEntry(probs, tiers);
      const breakEven =
        mode === "power" && parseNum(powerPayout) !== null
          ? equalPickBreakEven(parseNum(powerPayout)!, picks)
          : null;
      return { evaluation, breakEven };
    } catch {
      return null;
    }
  }, [picks, mode, powerPayout, flexTiers, equalMode, equalProb, pickProbs]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Number of picks</Label>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setPickCount(n)}
                className={cn(
                  "h-11 flex-1 rounded-md border text-[14px] font-semibold",
                  picks === n
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover-elevate",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px] text-muted-foreground">Entry type</Label>
          <div className="flex gap-1">
            {(["power", "flex"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-11 flex-1 rounded-md border text-[14px] font-semibold capitalize",
                  mode === m
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover-elevate",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "power" ? (
        <Field label="Total payout multiplier (all picks must hit)" value={powerPayout} onChange={setPowerPayout} suffix="x" />
      ) : (
        <div className="space-y-2">
          <Label className="text-[12px] text-muted-foreground">
            Flex payout tiers (multiplier per outcome — edit to match current rules)
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {flexTiers.map((t, i) => (
              <Field
                key={t.hits}
                label={`${t.hits} of ${picks} hit`}
                value={t.mult}
                onChange={(v) =>
                  setFlexTiers((prev) => prev.map((p, j) => (j === i ? { ...p, mult: v } : p)))
                }
                suffix="x"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-[13px] text-foreground">Same probability for every pick</span>
        <Switch checked={equalMode} onCheckedChange={setEqualMode} />
      </div>

      {equalMode ? (
        <Field label="Estimated probability per pick" value={equalProb} onChange={setEqualProb} suffix="%" />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: picks }, (_, i) => (
            <Field
              key={i}
              label={`Pick ${i + 1}`}
              value={pickProbs[i]}
              onChange={(v) => setPickProbs((prev) => prev.map((p, j) => (j === i ? v : p)))}
              suffix="%"
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
        <span className="text-[13px] text-foreground">Picks may be correlated (same game or player)</span>
        <Switch checked={correlated} onCheckedChange={setCorrelated} />
      </div>

      {correlated ? (
        <p className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[13px] leading-snug text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Correlated picks do not behave independently. These results assume independence and can
          overstate or understate the true chance of hitting every tier.
        </p>
      ) : null}

      {result ? (
        <>
          <ResultCard title="Entry evaluation">
            {result.breakEven !== null ? (
              <ResultRow
                label="Break-even probability per pick (equal picks)"
                value={formatProb(result.breakEven)}
              />
            ) : null}
            <ResultRow label="Chance all picks hit" value={formatProb(result.evaluation.allHitProb)} />
            <ResultRow
              label="Equivalent American odds (all picks hit)"
              value={formatAmerican(probToAmerican(result.evaluation.allHitProb))}
            />
            <ResultRow label="Expected payout per $1 entered" value={`$${result.evaluation.expectedPayout.toFixed(3)}`} />
            <ResultRow
              label="Expected return"
              value={formatSignedPct(result.evaluation.expectedReturn)}
              tone={result.evaluation.expectedReturn > 0 ? "good" : "bad"}
            />
          </ResultCard>

          <ResultCard title="Chance of each outcome">
            {result.evaluation.distribution
              .map((prob, hits) => ({ prob, hits }))
              .reverse()
              .map(({ prob, hits }) => {
                const tier = result.evaluation.tierProbs.find((t) => t.hits === hits);
                return (
                  <ResultRow
                    key={hits}
                    label={`${hits} of ${picks} hit${tier ? ` — pays ${tier.multiplier}x` : " — no payout"}`}
                    value={formatProb(prob)}
                  />
                );
              })}
          </ResultCard>
          <p className="text-[12px] leading-4 text-muted-foreground">
            Payout multipliers are user-entered assumptions. Verify them against the platform's
            current rules before relying on these numbers.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Enter probabilities between 0 and 100 and a valid payout to see results.
        </p>
      )}
    </div>
  );
}

function ExchangeCalculator() {
  const [price, setPrice] = useState("52");
  const [fee, setFee] = useState("0");
  const [fairProb, setFairProb] = useState("55");

  const result = useMemo(() => {
    const p = parseNum(price);
    const f = parseNum(fee);
    const fair = parseNum(fairProb);
    if (p === null || f === null || fair === null || fair <= 0 || fair >= 100) return null;
    try {
      return evaluateExchangeContract(p, f, fair / 100);
    } catch {
      return null;
    }
  }, [price, fee, fairProb]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Contract price" value={price} onChange={setPrice} suffix="¢" />
        <Field label="Fees" value={fee} onChange={setFee} suffix="¢" />
        <Field label="Fair probability" value={fairProb} onChange={setFairProb} suffix="%" />
      </div>
      <p className="text-[12px] leading-4 text-muted-foreground">
        Use the price you can actually get (the ask), not the midpoint. The contract pays $1.00 if
        it settles yes.
      </p>

      {result ? (
        <ResultCard title="Contract evaluation">
          <ResultRow label="Break-even probability (fees included)" value={formatProb(result.breakEvenProb)} />
          <ResultRow
            label="Estimated difference"
            value={formatSignedPct(result.edge)}
            tone={result.edge > 0 ? "good" : "bad"}
          />
          <ResultRow
            label="Expected profit per contract"
            value={`${result.expectedProfit >= 0 ? "+" : "-"}$${Math.abs(result.expectedProfit).toFixed(3)}`}
            tone={result.expectedProfit > 0 ? "good" : "bad"}
          />
          <ResultRow
            label="Fee-adjusted return"
            value={formatSignedPct(result.feeAdjustedReturn)}
            tone={result.feeAdjustedReturn > 0 ? "good" : "bad"}
          />
        </ResultCard>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Enter a price between 1 and 99 cents and a probability between 0 and 100.
        </p>
      )}
    </div>
  );
}

export default function CalculatorsPage() {
  return (
    <AppShell title="Calculators">
      <div className="mx-auto w-full max-w-2xl px-4 pt-3">
        <Tabs defaultValue="vig">
          <TabsList className="grid h-11 w-full grid-cols-3">
            <TabsTrigger value="vig" className="text-[13px]">Vig remover</TabsTrigger>
            <TabsTrigger value="entry" className="text-[13px]">PrizePicks</TabsTrigger>
            <TabsTrigger value="exchange" className="text-[13px]">NoVig</TabsTrigger>
          </TabsList>
          <TabsContent value="vig" className="mt-3">
            <VigCalculator />
          </TabsContent>
          <TabsContent value="entry" className="mt-3">
            <EntryCalculator />
          </TabsContent>
          <TabsContent value="exchange" className="mt-3">
            <ExchangeCalculator />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
