import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { opportunities as sampleOpportunities } from "@/data/opportunities";
import { formatAmerican, formatProb } from "@/lib/format";
import { platformName } from "@/components/badges";
import { cn } from "@/lib/utils";
import { DISCLAIMER } from "@shared/types";
import type { Grade, Opportunity } from "@shared/types";

interface LiveFeed {
  origin: "live" | "none";
  generatedAt: string;
  count: number;
  opportunities: Opportunity[];
}

interface CategoryRecord {
  label: string;
  wins: number;
  losses: number;
  cashProfit: number;
}

interface JournalData {
  summary: {
    byPlatform: CategoryRecord[];
    byFamily: CategoryRecord[];
    byFlags: CategoryRecord[];
  };
}

const gradeChip: Record<Grade, string> = {
  A: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  B: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  C: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  D: "bg-red-500/15 text-red-400 border-red-500/40",
  Incomplete: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

function StatTile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-card-border bg-secondary/50 px-4 py-3 text-center">
      <div className={cn("text-[26px] font-extrabold tabular-nums leading-8", accent ? "text-emerald-400" : "text-foreground")}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Shareable daily report card: today's top opportunities ranked by edge,
 * plus the personal record strips from the journal. Downloadable as PNG.
 * Honest by design — plain language, sample sizes, no hype vocabulary.
 */
export default function ReportPage() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: liveFeed } = useQuery<LiveFeed>({
    queryKey: ["/api/opportunities"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/opportunities");
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as LiveFeed;
      } catch {
        return { origin: "none", generatedAt: "", count: 0, opportunities: [] };
      }
    },
    staleTime: 60_000,
  });

  const { data: journal } = useQuery<JournalData | null>({
    queryKey: ["/api/bets"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/bets");
        if (!res.ok) return null;
        return (await res.json()) as JournalData;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const isLive = (liveFeed?.count ?? 0) > 0;
  const source = isLive ? liveFeed!.opportunities : sampleOpportunities;
  const ranked = [...source].sort((a, b) => b.edgePts - a.edgePts).slice(0, 10);
  const maxEdge = Math.max(...ranked.map((o) => Math.max(o.edgePts, 0)), 1);
  const positiveCount = source.filter((o) => o.edgePts > 0).length;
  const topEdge = ranked[0]?.edgePts ?? 0;
  const medianBooks = ranked.length > 0 ? ranked[Math.floor(ranked.length / 2)].consensus.sourceCount : 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const pitching = journal?.summary.byFamily.find((r) => r.label === "Pitching outcomes only");
  const dogMl = journal?.summary.byFlags.find((r) => r.label.includes("moneyline"));
  const pp = journal?.summary.byPlatform.find((r) => r.label === "prizepicks");

  const downloadPng = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0e0f12",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `edge-report-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl bg-background px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/" className="inline-flex h-11 items-center gap-1.5 text-[14px] font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to research
        </Link>
        <Button className="h-10" onClick={downloadPng} disabled={exporting} data-testid="button-download-report">
          <Download className="mr-1.5 h-4 w-4" />
          {exporting ? "Rendering…" : "Download PNG"}
        </Button>
      </div>

      {/* The exportable card */}
      <div ref={cardRef} className="overflow-hidden rounded-2xl border border-border bg-background">
        {/* Masthead */}
        <div className="border-b-2 border-emerald-500/40 bg-card px-5 pb-4 pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Edge Research</div>
              <h1 className="mt-1 text-[28px] font-extrabold leading-8 tracking-tight text-foreground">
                Daily MLB Edge Report
              </h1>
            </div>
            <div className="shrink-0 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-right">
              <div className="text-[12px] font-bold text-foreground">{today}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isLive ? "Live market data" : "Sample data"}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-4 text-muted-foreground">
            Multi-book no-vig consensus · median fair probability · vig removed per book before
            comparing. Grades reflect market value and data confidence only.
          </p>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-2.5 px-5 py-4">
          <StatTile value={String(positiveCount)} label="Priced edges found" accent />
          <StatTile value={`+${topEdge.toFixed(1)}`} label="Top edge (pts)" accent />
          <StatTile value={String(medianBooks)} label="Books per market" />
        </div>

        {/* Ranked list */}
        <div className="px-5 pb-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-foreground">
              Top opportunities by estimated difference
            </h2>
            <span className="text-[11px] text-muted-foreground">vs market consensus</span>
          </div>

          <ol className="space-y-1.5">
            {ranked.map((o, i) => (
              <li key={o.id} className="rounded-xl border border-card-border bg-card px-3.5 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 shrink-0 text-center text-[20px] font-extrabold tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-bold text-foreground">
                        {o.player ?? o.eventName}
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-400">
                        +{o.edgePts.toFixed(1)} pts
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] text-muted-foreground">
                        {o.market} — {o.side}
                        {o.line !== 0 ? ` ${o.line}` : ""}
                        {o.offeredOdds !== null ? ` · ${formatAmerican(o.offeredOdds)}` : ""}
                        {" · "}
                        {platformName(o.platform)}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        mkt {formatProb(o.consensus.fairProb, 0)} · {o.consensus.sourceCount} books
                      </span>
                    </div>
                    {/* Edge meter: single-hue magnitude bar, labeled above */}
                    <div className="mt-1.5 h-[6px] w-full overflow-hidden rounded-[3px] bg-secondary/70">
                      <div
                        className="h-full rounded-[3px] bg-emerald-400"
                        style={{ width: `${Math.max(4, (Math.max(o.edgePts, 0) / maxEdge) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[15px] font-extrabold",
                      gradeChip[o.grade],
                    )}
                    aria-label={`Grade ${o.gradeLabel}`}
                  >
                    {o.gradeLabel === "Incomplete" ? "–" : o.gradeLabel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Personal record strip */}
        {pitching || dogMl || pp ? (
          <div className="px-5 pb-2 pt-3">
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-foreground">
              Your journal says
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {pitching ? (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-center">
                  <div className="text-[18px] font-extrabold tabular-nums text-emerald-400">
                    {pitching.wins}-{pitching.losses}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pitching outcomes
                  </div>
                </div>
              ) : null}
              {dogMl ? (
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-center">
                  <div className="text-[18px] font-extrabold tabular-nums text-red-400">
                    {dogMl.wins}-{dogMl.losses}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Dog moneylines
                  </div>
                </div>
              ) : null}
              {pp ? (
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-center">
                  <div className="text-[18px] font-extrabold tabular-nums text-red-400">
                    {pp.wins}-{pp.losses}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    PrizePicks entries
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Small samples — direction, not proof. Stick to the formula: pitching outcomes, ≤2 legs,
              no dog moneylines.
            </p>
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-2 border-t border-border bg-card px-5 py-3">
          <p className="text-[10px] leading-4 text-muted-foreground">{DISCLAIMER}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            Matchup, lineup, and weather analysis are not yet applied — these are price signals, not
            picks. The user makes every decision. No wagers are placed by this tool.
          </p>
        </div>
      </div>
    </div>
  );
}
