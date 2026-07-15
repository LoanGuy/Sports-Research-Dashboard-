import { cn } from "@/lib/utils";
import { formatEdgePts } from "@/lib/format";
import type {
  DataConfidence,
  Freshness,
  Grade,
  Liquidity,
  Platform,
} from "@shared/types";

/**
 * Small labeled indicators. Color always travels with a text label so the
 * meaning never depends on color alone.
 */

const badgeBase =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap";

const gradeStyles: Record<Grade, string> = {
  A: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  B: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  C: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  D: "bg-red-500/15 text-red-400 border border-red-500/30",
  Incomplete: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
};

export function GradeBadge({ grade, label, size = "sm" }: { grade: Grade; label: string; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-bold",
        gradeStyles[grade],
        size === "lg" ? "px-2.5 py-1 text-base" : "px-2 py-0.5 text-sm",
        grade === "Incomplete" && size === "sm" && "text-[11px]",
      )}
      aria-label={`Grade ${label}`}
    >
      {label}
    </span>
  );
}

const platformNames: Record<Platform, string> = {
  hardrock: "Hard Rock",
  prizepicks: "PrizePicks",
  novig: "NoVig",
};

const platformStyles: Record<Platform, string> = {
  hardrock: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  prizepicks: "bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30",
  novig: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className={cn(badgeBase, platformStyles[platform])}>{platformNames[platform]}</span>;
}

export function platformName(platform: Platform): string {
  return platformNames[platform];
}

const freshnessLabels: Record<Freshness, string> = {
  fresh: "Fresh",
  delayed: "Delayed",
  stale: "Stale",
  unavailable: "Unavailable",
  partial: "Partial data",
};

const freshnessStyles: Record<Freshness, string> = {
  fresh: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  delayed: "bg-amber-500/10 text-amber-400 border border-amber-500/25",
  stale: "bg-red-500/10 text-red-400 border border-red-500/25",
  unavailable: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25",
  partial: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25",
};

export function FreshnessBadge({ freshness, updated }: { freshness: Freshness; updated?: string }) {
  return (
    <span className={cn(badgeBase, freshnessStyles[freshness])}>
      {freshnessLabels[freshness]}
      {updated ? <span className="opacity-70">· {updated}</span> : null}
    </span>
  );
}

const confidenceLabels: Record<DataConfidence, string> = {
  high: "High data confidence",
  medium: "Medium data confidence",
  low: "Low data confidence",
};

const confidenceShort: Record<DataConfidence, string> = {
  high: "High conf.",
  medium: "Med conf.",
  low: "Low conf.",
};

const confidenceStyles: Record<DataConfidence, string> = {
  high: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  medium: "bg-amber-500/10 text-amber-400 border border-amber-500/25",
  low: "bg-red-500/10 text-red-400 border border-red-500/25",
};

export function ConfidenceBadge({ confidence, short = false }: { confidence: DataConfidence; short?: boolean }) {
  return (
    <span className={cn(badgeBase, confidenceStyles[confidence])}>
      {short ? confidenceShort[confidence] : confidenceLabels[confidence]}
    </span>
  );
}

const liquidityLabels: Record<Liquidity, string> = {
  high: "High liquidity",
  moderate: "Moderate liquidity",
  low: "Low liquidity",
  unknown: "Unknown liquidity",
};

const liquidityStyles: Record<Liquidity, string> = {
  high: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  moderate: "bg-amber-500/10 text-amber-400 border border-amber-500/25",
  low: "bg-red-500/10 text-red-400 border border-red-500/25",
  unknown: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25",
};

export function LiquidityBadge({ liquidity }: { liquidity: Liquidity }) {
  return <span className={cn(badgeBase, liquidityStyles[liquidity])}>{liquidityLabels[liquidity]}</span>;
}

/** Estimated difference vs the market, labeled and signed. */
export function EdgeText({ pts, className }: { pts: number; className?: string }) {
  const tone = pts >= 2 ? "text-emerald-400" : pts > 0 ? "text-emerald-400/80" : "text-red-400";
  return (
    <span className={cn("font-semibold tabular-nums", tone, className)}>
      Est. difference {formatEdgePts(pts)}
    </span>
  );
}

export function ReviewFlag() {
  return (
    <span className={cn(badgeBase, "bg-amber-500/10 text-amber-400 border border-amber-500/25")}>
      Market match needs review
    </span>
  );
}
