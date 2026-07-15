import { Link, useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GradeBreakdown } from "@/components/grade-breakdown";
import {
  ConfidenceBadge,
  EdgeText,
  FreshnessBadge,
  GradeBadge,
  LiquidityBadge,
  PlatformBadge,
  ReviewFlag,
  platformName,
} from "@/components/badges";
import { getOpportunity } from "@/data/opportunities";
import { formatAmerican, formatHitRate, formatProb } from "@/lib/format";
import { probToAmerican } from "@/lib/odds";
import type { LineupStatus, RoofStatus } from "@shared/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-card-border bg-card px-4 py-3.5">
      <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

const lineupLabels: Record<LineupStatus, string> = {
  confirmed: "Confirmed",
  projected: "Projected",
  not_in_lineup: "Not in lineup",
  unavailable: "Lineup unavailable",
  recently_changed: "Recently changed",
};

const roofLabels: Record<RoofStatus, string> = {
  outdoor: "Outdoor stadium",
  indoor_fixed: "Indoor (fixed roof)",
  roof_open_confirmed: "Roof open — confirmed",
  roof_closed_confirmed: "Roof closed — confirmed",
  roof_status_expected: "Roof status expected",
  roof_status_unknown: "Roof status unknown",
};

/** Detailed Mode: full research view for one opportunity. */
export default function OpportunityDetailPage() {
  const [, params] = useRoute("/opportunity/:id");
  const opportunity = params ? getOpportunity(params.id) : undefined;

  if (!opportunity) {
    return (
      <AppShell title="Not found">
        <div className="px-4 pt-6">
          <p className="text-[14px] text-muted-foreground">This opportunity does not exist.</p>
          <Link href="/" className="mt-3 inline-block text-[14px] font-medium text-primary">
            Back to research
          </Link>
        </div>
      </AppShell>
    );
  }

  const o = opportunity;
  const fairAmerican = formatAmerican(probToAmerican(o.consensus.fairProb));

  return (
    <AppShell title="Opportunity detail">
      <div className="space-y-3 px-4 pt-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-1.5 text-[14px] font-medium text-muted-foreground"
          data-testid="link-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back to research
        </Link>

        {/* 1. Player, event, market, platform offer, grade */}
        <section className="rounded-xl border border-card-border bg-card px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold leading-tight text-foreground">
                {o.player ?? o.eventName}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {o.eventName} · {o.eventTime}
              </p>
            </div>
            <GradeBadge grade={o.grade} label={o.gradeLabel} size="lg" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <PlatformBadge platform={o.platform} />
            <FreshnessBadge freshness={o.freshness} updated={o.lastUpdated} />
            <ConfidenceBadge confidence={o.dataConfidence} />
            {o.matchNeedsReview ? <ReviewFlag /> : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              label={`${platformName(o.platform)} offer`}
              value={`${o.side}${o.line !== 0 ? ` ${o.line}` : ""}${o.offeredOdds !== null ? ` · ${formatAmerican(o.offeredOdds)}` : ""}`}
            />
            <Stat label="Break-even probability" value={formatProb(o.breakEvenProb)} />
            <Stat label="Market fair probability" value={formatProb(o.consensus.fairProb)} />
            <Stat label="Market fair odds" value={fairAmerican} />
          </div>
          {o.payoutNote ? (
            <p className="mt-2 text-[12px] text-muted-foreground">{o.payoutNote}</p>
          ) : null}
          <div className="mt-2.5">
            <EdgeText pts={o.edgePts} className="text-[15px]" />
            <span className="ml-2 text-[12px] text-muted-foreground">
              (market estimate minus break-even, in percentage points)
            </span>
          </div>
        </section>

        {/* 2. Plain-language summary */}
        <Section title="Summary">
          <p className="text-[14px] leading-snug text-foreground">{o.summary}</p>
        </Section>

        {/* 3. Grade breakdown */}
        <Section title="Grade breakdown">
          <GradeBreakdown categories={o.categories} />
        </Section>

        {/* 4. Why / risks / bottom line */}
        <Section title="Why it grades well">
          <ul className="space-y-1.5">
            {o.whyItGradesWell.map((reason, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                {reason}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What could go wrong">
          <ul className="space-y-1.5">
            {o.whatCouldGoWrong.map((risk, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                {risk}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Bottom line">
          <p className="text-[14px] leading-snug text-foreground">{o.bottomLine}</p>
        </Section>

        {/* 5. Market comparison */}
        <Section title="Market comparison">
          <p className="text-[13px] text-muted-foreground">
            {o.consensus.sourceCount} sources · median fair estimate {formatProb(o.consensus.fairProb)} · range{" "}
            {formatProb(o.consensus.lowProb)}–{formatProb(o.consensus.highProb)} · disagreement{" "}
            {o.consensus.disagreement} · updated {o.consensus.lastUpdated}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Source</th>
                  <th className="py-1.5 pr-2 font-medium">Line</th>
                  <th className="py-1.5 pr-2 font-medium">Odds</th>
                  <th className="py-1.5 pr-2 font-medium">Fair prob</th>
                  <th className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {o.sources.map((s) => (
                  <tr key={s.source} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2 font-medium text-foreground">
                      {s.source}
                      {s.lineMismatch ? (
                        <span className="ml-1 text-[11px] text-amber-400">(different line)</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{s.line !== 0 ? s.line : "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {s.sideOdds !== null ? formatAmerican(s.sideOdds) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {s.fairProb !== null ? formatProb(s.fairProb) : "—"}
                    </td>
                    <td className="py-1.5">
                      <FreshnessBadge freshness={s.freshness} updated={s.lastUpdated} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Each source's vig is removed separately before comparing. Vig is the margin built into
            sportsbook prices. Line movement: {o.lineMovement}
          </p>
        </Section>

        {/* 6. Platform-specific panels */}
        {o.novig ? (
          <Section title="NoVig market">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Bid" value={`${o.novig.bidCents}¢`} />
              <Stat label="Ask" value={`${o.novig.askCents}¢`} />
              <Stat label="Midpoint" value={`${o.novig.midCents}¢`} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat
                label="Last trade"
                value={o.novig.lastTradeCents !== null ? `${o.novig.lastTradeCents}¢` : "—"}
              />
              <Stat
                label="Available at best price"
                value={o.novig.availableUsd !== null ? `$${o.novig.availableUsd}` : "Unknown"}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <LiquidityBadge liquidity={o.novig.liquidity} />
              <span className="text-[12px] text-muted-foreground">{o.novig.priceMovement}</span>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Value is calculated from the price actually available (the ask), not the midpoint.
            </p>
          </Section>
        ) : null}

        {o.prizepicks ? (
          <Section title="PrizePicks projection vs market">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="PrizePicks projection" value={`${o.line}`} />
              <Stat label="Sportsbook market line" value={`${o.prizepicks.marketLine}`} />
            </div>
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
              {o.prizepicks.marketLean} {o.prizepicks.projectionMovement}
            </p>
            {o.prizepicks.correlationWarning ? (
              <p className="mt-2 flex gap-2 text-[13px] text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {o.prizepicks.correlationWarning}
              </p>
            ) : null}
            <p className="mt-2 text-[12px] text-muted-foreground">
              Entry value depends on entry type and payout tiers — use the PrizePicks calculator to
              evaluate a full entry.
            </p>
          </Section>
        ) : null}

        {/* 7. Recent form */}
        <Section title="Recent form">
          <ul className="space-y-1.5">
            {o.recentForm.map((f, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="text-foreground">{f.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatHitRate(f.hits, f.total)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Recent hit rate is history, not a prediction. It is shown separately from market
            probability on purpose.
          </p>
        </Section>

        {/* 8. Conditions */}
        {o.weather ? (
          <Section title="Conditions">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14px] font-semibold text-foreground">{o.weather.venue}</span>
              <FreshnessBadge freshness={o.weather.freshness} updated={o.weather.observedAt} />
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{roofLabels[o.weather.roofStatus]}</p>
            {o.weather.tempF !== null ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Stat label="Temperature" value={`${o.weather.tempF}°F`} />
                <Stat
                  label="Wind"
                  value={`${o.weather.windMph} mph ${o.weather.windDirection ?? ""}`.trim()}
                />
                <Stat label="Humidity" value={o.weather.humidityPct !== null ? `${o.weather.humidityPct}%` : "—"} />
                <Stat label="Rain chance" value={o.weather.rainProbPct !== null ? `${o.weather.rainProbPct}%` : "—"} />
              </div>
            ) : null}
            <p className="mt-2 text-[13px] leading-snug text-foreground">{o.weather.note}</p>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Weather is one factor, not the entire reason for a grade. Forecast data comes from the
              National Weather Service in later phases.
            </p>
          </Section>
        ) : null}

        {/* 9. Lineup */}
        {o.lineupStatus ? (
          <Section title="Lineup">
            <p className="text-[14px] font-semibold text-foreground">{lineupLabels[o.lineupStatus]}</p>
            {o.lineupNote ? (
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{o.lineupNote}</p>
            ) : null}
          </Section>
        ) : null}

        {/* 10. Data confidence */}
        <Section title="Data confidence">
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={o.dataConfidence} />
          </div>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{o.dataConfidenceNote}</p>
        </Section>
      </div>
    </AppShell>
  );
}
