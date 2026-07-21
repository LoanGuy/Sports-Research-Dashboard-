import { useMemo, useState } from "react";
import { Link } from "wouter";
import { FileBarChart, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { OpportunityCard } from "@/components/opportunity-card";
import { platformName } from "@/components/badges";
import { MOCK_DATA_NOTICE, opportunities as sampleOpportunities } from "@/data/opportunities";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import type { Opportunity, Sport } from "@shared/types";

interface LiveFeed {
  origin: "live" | "none";
  generatedAt: string;
  count: number;
  opportunities: Opportunity[];
  reason?: string;
}

type SortKey = "edge" | "grade" | "time";

const sportChips: { value: Sport | "all"; label: string }[] = [
  { value: "all", label: "All sports" },
  { value: "mlb", label: "MLB" },
  { value: "cbb", label: "College basketball" },
];

const sortChips: { value: SortKey; label: string }[] = [
  { value: "edge", label: "Sort: Est. difference" },
  { value: "grade", label: "Sort: Grade" },
  { value: "time", label: "Sort: Start time" },
];

const gradeOrder = { A: 0, B: 1, C: 2, D: 3, Incomplete: 4 } as const;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium",
        active
          ? "border-primary/50 bg-primary/15 text-foreground"
          : "border-border bg-card text-muted-foreground hover-elevate",
      )}
    >
      {children}
    </button>
  );
}

/** Main feed: Compact Mode list of research opportunities. */
export default function ResearchPage() {
  const [sport, setSport] = useState<Sport | "all">("all");
  const [platform, setPlatform] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("edge");

  // Live opportunities from the collection pipeline; sample data is the
  // fallback so the mockup keeps working with nothing configured.
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
    refetchInterval: 5 * 60_000,
  });

  const [collectMessage, setCollectMessage] = useState<string | null>(null);
  const collect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/collect/run");
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setCollectMessage(data.message ?? "Collection finished.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consensus"] });
    },
  });

  const hasLiveData = liveFeed?.origin === "live";
  const isLive = hasLiveData && (liveFeed?.count ?? 0) > 0;
  const opportunities = isLive ? liveFeed!.opportunities : sampleOpportunities;

  const platformChips = useMemo(() => {
    const unique = Array.from(new Set(opportunities.map((o) => o.platform)));
    return [
      { value: "all", label: "All platforms" },
      ...unique.map((p) => ({ value: p, label: platformName(p) })),
    ];
  }, [opportunities]);

  const filtered = useMemo(() => {
    const list = opportunities.filter(
      (o) => (sport === "all" || o.sport === sport) && (platform === "all" || o.platform === platform),
    );
    return [...list].sort((a, b) => {
      if (sort === "edge") return b.edgePts - a.edgePts;
      if (sort === "grade") return gradeOrder[a.grade] - gradeOrder[b.grade];
      return a.eventTime.localeCompare(b.eventTime);
    });
  }, [opportunities, sport, platform, sort]);

  return (
    <AppShell>
      <div className="sticky top-14 z-30 space-y-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="scrollbar-none flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
          {sportChips.map((c) => (
            <Chip key={c.value} active={sport === c.value} onClick={() => setSport(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
          {platformChips.map((c) => (
            <Chip key={c.value} active={platform === c.value} onClick={() => setPlatform(c.value)}>
              {c.label}
            </Chip>
          ))}
          <div className="w-1 shrink-0 border-l border-border" aria-hidden />
          {sortChips.map((c) => (
            <Chip key={c.value} active={sort === c.value} onClick={() => setSort(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 px-4 pt-3 md:grid md:grid-cols-2 md:items-start md:gap-3 md:space-y-0 xl:grid-cols-3">
        <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-3">
          <Link
            href="/report"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-[13px] font-semibold text-foreground hover-elevate"
            data-testid="link-report"
          >
            <FileBarChart className="h-4 w-4 text-emerald-400" /> Edge Report
          </Link>
          <button
            onClick={() => collect.mutate()}
            disabled={collect.isPending}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-[13px] font-semibold text-foreground hover-elevate disabled:opacity-60"
            data-testid="button-collect"
          >
            <RefreshCw className={cn("h-4 w-4 text-sky-400", collect.isPending && "animate-spin")} />
            {collect.isPending ? "Collecting…" : "Refresh market data"}
          </button>
        </div>
        {collectMessage ? (
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-4 text-muted-foreground md:col-span-2 xl:col-span-3">
            {collectMessage}
          </p>
        ) : null}

        {hasLiveData && !isLive ? (
          <p className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-[12px] leading-4 text-sky-300 md:col-span-2 xl:col-span-3">
            Live data collected, but none of your books (Hard Rock, Fliff) currently beat the
            market consensus by 1+ points. That is a normal, honest result — edges come and go.
            Use Calculators → Price check to evaluate any line manually, or refresh closer to
            game time. Sample cards are shown below for reference.
          </p>
        ) : null}
        {isLive ? (
          <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[12px] leading-4 text-emerald-400 md:col-span-2 xl:col-span-3">
            Live market data — {liveFeed!.count} opportunities at your books (Hard Rock, Fliff)
            from the latest collection run, measured against the full multi-book consensus.
            Matchup and form analysis are not yet applied. Tap any card for details.
          </p>
        ) : (
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-4 text-muted-foreground md:col-span-2 xl:col-span-3">
            {MOCK_DATA_NOTICE} Tap any card for the detailed research view.
          </p>
        )}

        {filtered.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground md:col-span-2 xl:col-span-3">
            No opportunities match the current filters.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
