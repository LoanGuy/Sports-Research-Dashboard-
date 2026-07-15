/** Display formatting helpers. Pure functions, no data access. */

/** Format American odds with an explicit sign: 150 -> "+150", -115 -> "-115". */
export function formatAmerican(odds: number): string {
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/** Format a 0..1 probability as a labeled percentage: 0.563 -> "56.3%". */
export function formatProb(prob: number, decimals = 1): string {
  return `${(prob * 100).toFixed(decimals)}%`;
}

/** Format percentage points with a sign: 3.8 -> "+3.8 pts". */
export function formatEdgePts(pts: number, decimals = 1): string {
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(decimals)} pts`;
}

/** Format a signed percentage: 0.038 -> "+3.8%". */
export function formatSignedPct(fraction: number, decimals = 1): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

/** "Hit in 6 of the last 7 games — 86%" style label. */
export function formatHitRate(hits: number, total: number): string {
  if (total === 0) return "No sample";
  return `${hits} of ${total} — ${Math.round((hits / total) * 100)}%`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
