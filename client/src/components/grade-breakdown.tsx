import type { GradeCategory } from "@shared/types";
import { GradeBadge } from "@/components/badges";

/**
 * Detailed Mode grade panel: every category is shown separately with its
 * weight and a plain-language note — never one unexplained score.
 */
export function GradeBreakdown({ categories }: { categories: GradeCategory[] }) {
  return (
    <ul className="space-y-2.5">
      {categories.map((c) => (
        <li key={c.key} className="flex gap-3">
          <div className="w-9 shrink-0 pt-0.5 text-center">
            <GradeBadge grade={c.grade} label={c.grade === "Incomplete" ? "Inc" : c.grade} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-foreground">
              {c.label}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                weight {c.weightPct}%
              </span>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{c.note}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
