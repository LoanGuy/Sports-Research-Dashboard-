import { AlertTriangle, Info } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FoulMeter } from "@/components/foul-meter";
import { FreshnessBadge } from "@/components/badges";
import { liveGames } from "@/data/live-games";
import type { LiveGame } from "@shared/types";

function LiveGameCard({ game }: { game: LiveGame }) {
  return (
    <div className="rounded-xl border border-card-border bg-card px-4 py-3.5" data-testid={`live-${game.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[16px] font-bold text-foreground">
            {game.away.shortName} {game.away.score} — {game.home.score} {game.home.shortName}
          </div>
          <div className="text-[12px] text-muted-foreground">
            {game.away.name} @ {game.home.name}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-semibold tabular-nums text-foreground">
            {game.half} · {game.clock}
          </div>
          <FreshnessBadge freshness={game.freshness} updated={game.lastUpdated} />
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-lg bg-secondary/60 px-3 py-2.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Team fouls (this half)
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[13px] font-semibold text-foreground">{game.away.shortName}</span>
            <div className="min-w-0 flex-1">
              <FoulMeter team={game.away} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[13px] font-semibold text-foreground">{game.home.shortName}</span>
            <div className="min-w-0 flex-1">
              <FoulMeter team={game.home} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <div className="text-[11px] text-muted-foreground">Pregame total</div>
          <div className="text-[15px] font-semibold tabular-nums text-foreground">{game.pregameTotal}</div>
        </div>
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <div className="text-[11px] text-muted-foreground">Live total</div>
          <div className="text-[15px] font-semibold tabular-nums text-foreground">{game.liveTotal}</div>
        </div>
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <div className="text-[11px] text-muted-foreground">Pace</div>
          <div className="text-[15px] font-semibold capitalize text-foreground">{game.pace}</div>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">{game.paceNote}</p>

      {game.alerts.length > 0 ? (
        <div className="mt-3 space-y-2">
          {game.alerts.map((alert, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[13px] leading-snug text-foreground"
            >
              {alert.severity === "caution" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden />
              )}
              <div>
                {alert.message}
                <span className="ml-1.5 text-[11px] text-muted-foreground">{alert.time}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** College basketball live monitor: fouls, bonus status, pace, alerts. */
export default function LivePage() {
  return (
    <AppShell title="Live monitor">
      <div className="mx-auto w-full max-w-3xl space-y-2.5 px-4 pt-3">
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold leading-4 text-amber-400">
          DEMO SCREEN — these games, scores, and fouls are fictional sample data. A real college
          basketball feed lands in a later phase.
        </p>
        <p className="rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-4 text-muted-foreground">
          College basketball foul monitor preview. Traffic light: Gray 0–5 team fouls, Yellow
          6–9, Green 10+. Foul counts always shown beside the color. Alerts describe the situation —
          they never recommend the Over.
        </p>
        {liveGames.map((game) => (
          <LiveGameCard key={game.id} game={game} />
        ))}
      </div>
    </AppShell>
  );
}
