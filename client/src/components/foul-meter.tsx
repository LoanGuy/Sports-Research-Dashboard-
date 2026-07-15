import { cn } from "@/lib/utils";
import type { FoulLight, LiveTeamState } from "@shared/types";

/**
 * Traffic-light foul indicator for the college basketball live monitor.
 * Gray: 0-5 team fouls. Yellow: 6-9. Green: 10+.
 * The foul count is always shown beside the color.
 */
export function foulLight(fouls: number): FoulLight {
  if (fouls >= 10) return "green";
  if (fouls >= 6) return "yellow";
  return "gray";
}

const lightStyles: Record<FoulLight, { dot: string; text: string; label: string }> = {
  gray: { dot: "bg-zinc-500", text: "text-zinc-400", label: "Gray" },
  yellow: { dot: "bg-amber-400", text: "text-amber-400", label: "Yellow" },
  green: { dot: "bg-emerald-400", text: "text-emerald-400", label: "Green" },
};

export function FoulMeter({ team }: { team: LiveTeamState }) {
  const light = foulLight(team.fouls);
  const style = lightStyles[light];
  const bonusLabel = team.inDoubleBonus ? "Double bonus" : team.inBonus ? "Bonus" : "Not in bonus";
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", style.dot)} aria-hidden />
        <span className={cn("text-[14px] font-semibold tabular-nums", style.text)}>
          {team.fouls} fouls — {style.label}
        </span>
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground">
        {bonusLabel} · {team.ftAttempts} FTA
      </span>
    </div>
  );
}
