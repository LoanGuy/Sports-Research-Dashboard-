import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { OpportunityCard } from "@/components/opportunity-card";
import { MOCK_DATA_NOTICE, opportunities } from "@/data/opportunities";
import { cn } from "@/lib/utils";
import type { Platform, Sport } from "@shared/types";

type SortKey = "edge" | "grade" | "time";

const sportChips: { value: Sport | "all"; label: string }[] = [
  { value: "all", label: "All sports" },
  { value: "mlb", label: "MLB" },
  { value: "tennis", label: "Tennis" },
  { value: "cbb", label: "College basketball" },
];

const platformChips: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "hardrock", label: "Hard Rock" },
  { value: "prizepicks", label: "PrizePicks" },
  { value: "novig", label: "NoVig" },
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
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [sort, setSort] = useState<SortKey>("edge");

  const filtered = useMemo(() => {
    const list = opportunities.filter(
      (o) => (sport === "all" || o.sport === sport) && (platform === "all" || o.platform === platform),
    );
    return [...list].sort((a, b) => {
      if (sort === "edge") return b.edgePts - a.edgePts;
      if (sort === "grade") return gradeOrder[a.grade] - gradeOrder[b.grade];
      return a.eventTime.localeCompare(b.eventTime);
    });
  }, [sport, platform, sort]);

  return (
    <AppShell>
      <div className="sticky top-14 z-30 space-y-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {sportChips.map((c) => (
            <Chip key={c.value} active={sport === c.value} onClick={() => setSport(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
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

      <div className="space-y-2.5 px-4 pt-3">
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-4 text-muted-foreground">
          {MOCK_DATA_NOTICE} Tap any card for the detailed research view.
        </p>

        {filtered.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">
            No opportunities match the current filters.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
