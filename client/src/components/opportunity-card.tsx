import { Link } from "wouter";
import { ChevronRight, Plus } from "lucide-react";
import { addLeg } from "@/lib/parlay";
import type { Opportunity } from "@shared/types";
import { formatAmerican, formatHitRate, formatProb } from "@/lib/format";
import {
  ConfidenceBadge,
  EdgeText,
  FreshnessBadge,
  GradeBadge,
  PlatformBadge,
  ReviewFlag,
} from "@/components/badges";

/**
 * Compact Mode card: the default browsing unit. Shows only the most
 * important information; tapping opens Detailed Mode.
 */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const o = opportunity;
  return (
    <Link
      href={`/opportunity/${o.id}`}
      className="block rounded-xl border border-card-border bg-card px-3.5 py-3 hover-elevate active-elevate-2"
      data-testid={`card-${o.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold text-foreground">
            {o.player ?? o.eventName}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {o.market} — {o.side}
            {o.line !== 0 ? ` ${o.line}` : ""}
            {o.offeredOdds !== null ? ` · ${formatAmerican(o.offeredOdds)}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <GradeBadge grade={o.grade} label={o.gradeLabel} />
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <EdgeText pts={o.edgePts} />
        <span className="text-muted-foreground">
          Market {formatProb(o.consensus.fairProb, 0)} · {o.consensus.sourceCount} sources
        </span>
        {o.recentForm[0] ? (
          <span className="text-muted-foreground">
            Recent: {formatHitRate(o.recentForm[0].hits, o.recentForm[0].total)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PlatformBadge platform={o.platform} />
        <FreshnessBadge freshness={o.freshness} updated={o.lastUpdated} />
        <ConfidenceBadge confidence={o.dataConfidence} short />
        {o.matchNeedsReview ? <ReviewFlag /> : null}
        {o.origin === "live" && o.offeredOdds !== null ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addLeg(o);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-[11px] font-semibold text-foreground hover-elevate"
            data-testid={`button-parlay-${o.id}`}
          >
            <Plus className="h-3 w-3" /> Parlay
          </button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">{o.eventTime}</span>
      </div>
    </Link>
  );
}
