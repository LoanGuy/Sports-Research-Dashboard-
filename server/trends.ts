/**
 * Trend research: user-uploaded screenshots (Linemate-style trend cards)
 * parsed into structured signals, stored per game day, and matched into
 * the opportunity grading (Recent form / Matchup categories).
 *
 * Parsing uses the Claude API (vision). Requires ANTHROPIC_API_KEY; when
 * unset, the parse endpoint fails soft with a clear message and manual
 * trend entry still works.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { trends, type Trend } from "@shared/schema";
import { getDb } from "./db";

// ---- Input validation ----

export const trendSignalSchema = z.object({
  kind: z.enum(["recent", "vs_opponent", "home_away", "alt_line", "other"]).default("other"),
  label: z.string().min(1),
  hits: z.number().int().min(0),
  total: z.number().int().min(1),
});

export const trendInputSchema = z.object({
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  playerName: z.string().min(1),
  team: z.string().nullable().optional(),
  market: z.string().min(1),
  side: z.enum(["over", "under"]).default("over"),
  line: z.number().nullable().optional(),
  oddsAmerican: z.number().int().nullable().optional(),
  signals: z.array(trendSignalSchema).default([]),
  note: z.string().nullable().optional(),
  source: z.enum(["upload", "manual"]).default("manual"),
});

export type TrendInput = z.infer<typeof trendInputSchema>;
export type TrendSignal = z.infer<typeof trendSignalSchema>;

/** Today's date in US Eastern time (game days follow ET). */
export function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/**
 * Map a free-text trend market label (as sites like Linemate phrase it) to
 * the market names used by the odds collectors, so trends join the feed.
 * Unrecognized labels pass through unchanged (they simply won't match).
 */
export function canonicalTrendMarket(raw: string): string {
  const m = raw.trim().toLowerCase();
  if (m.includes("total base")) return "Total bases";
  if (m === "hits" || m === "hit" || m.includes("0.5 hits")) return "Hits";
  if (m.includes("home run")) return "Home runs";
  if (m.includes("rbi") && !m.includes("h+r")) return "RBIs";
  if (m.includes("stolen base")) return "Stolen bases";
  if (m.includes("single")) return "Hits"; // closest priced market
  if (m.includes("pitcher out") || m.includes("outs recorded")) return "Pitcher outs recorded";
  if (m.includes("earned run")) return "Earned runs allowed";
  if (m.includes("walks allowed")) return "Pitcher walks";
  if (m.includes("strikeout")) return "Pitcher strikeouts";
  return raw.trim();
}

// ---- CRUD ----

export async function listTrends(gameDate: string): Promise<Trend[]> {
  const db = getDb();
  return db.select().from(trends).where(eq(trends.gameDate, gameDate)).orderBy(desc(trends.id));
}

export async function createTrends(inputs: TrendInput[], normalizeKey: (name: string) => string): Promise<Trend[]> {
  const db = getDb();
  const date = todayEt();
  const rows = inputs.map((t) => ({
    gameDate: t.gameDate ?? date,
    playerName: t.playerName.trim(),
    playerKey: normalizeKey(t.playerName),
    team: t.team ?? null,
    market: canonicalTrendMarket(t.market),
    side: t.side,
    line: t.line ?? null,
    oddsAmerican: t.oddsAmerican ?? null,
    signals: t.signals,
    note: t.note ?? null,
    source: t.source,
  }));
  if (rows.length === 0) return [];
  return db.insert(trends).values(rows).returning();
}

export async function deleteTrend(id: number): Promise<void> {
  const db = getDb();
  await db.delete(trends).where(eq(trends.id, id));
}

// ---- Screenshot parsing (Claude vision) ----

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          playerName: {
            type: "string",
            description:
              "Player name as shown. If the card shows an initial (e.g. 'B. Rice') and the full first name is clear from context, expand it; otherwise keep the initial.",
          },
          team: { type: ["string", "null"], description: "Team abbreviation if shown, else null." },
          market: {
            type: "string",
            description: "The stat market, e.g. 'Hits', 'Total Bases', 'Strikeouts', 'Pitcher Outs', 'Walks Allowed', 'H+R+RBI'.",
          },
          side: { type: "string", enum: ["over", "under"] },
          line: { type: ["number", "null"], description: "The line, e.g. 0.5 from 'Over 0.5 Hits'. Null if none." },
          oddsAmerican: { type: ["integer", "null"], description: "American odds shown on the card, e.g. -250. Null if none." },
          signals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  enum: ["recent", "vs_opponent", "home_away", "alt_line", "other"],
                  description:
                    "recent = 'hit in X of last Y games'; vs_opponent = 'X of last Y vs <team>'; home_away = home/away splits; alt_line = alternate-line records like '20/20'.",
                },
                label: { type: "string", description: "The signal text, e.g. 'Hit in 12 of last 12 games'." },
                hits: { type: "integer" },
                total: { type: "integer" },
              },
              required: ["kind", "label", "hits", "total"],
              additionalProperties: false,
            },
          },
          note: {
            type: ["string", "null"],
            description: "Non-numeric context worth keeping: weather/wind lines, opponent rank notes ('WSH rank poorly in Singles against'), matchup vs pitcher notes.",
          },
        },
        required: ["playerName", "team", "market", "side", "line", "oddsAmerican", "signals", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["trends"],
  additionalProperties: false,
} as const;

const PARSER_PROMPT = `These screenshots show sports betting trend cards (from a site like Linemate) for today's MLB games.

Extract EVERY distinct player trend you can read — trending cards, cheatsheet rows, parlay legs, and advanced-tool cards all count. One entry per unique player+market+line combination (merge duplicates across screenshots, combining their signals).

Rules:
- "Hit in 12 of last 12 games" → signal {kind: "recent", hits: 12, total: 12}.
- Cheatsheet rows like "B. Rice: Over 0.5 Hits 12/12" → hits 12, total 12, kind matches the column header (Recent Form → recent, Versus Opponent → vs_opponent, Alternate Lines → alt_line).
- Percentages without counts: skip the signal; put the text in note instead.
- Weather lines ("Rain with winds blowing left 10MPH") and opponent-rank lines go in note.
- Do not invent players, numbers, or markets that are not visible. If a value is unreadable, leave it null.`;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ParseImage {
  mediaType: string;
  data: string; // base64
}

export async function parseTrendImages(images: ParseImage[]): Promise<TrendInput[]> {
  if (!anthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it in Railway to enable screenshot parsing. Manual trend entry still works.");
  }
  const client = new Anthropic();
  const model = process.env.TREND_PARSER_MODEL || "claude-opus-4-8";

  const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const blocks: Anthropic.ContentBlockParam[] = images
    .filter((img) => allowed.has(img.mediaType))
    .map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: img.data,
      },
    }));
  if (blocks.length === 0) throw new Error("No supported images (PNG/JPEG/WebP/GIF) were provided.");

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [{ role: "user", content: [...blocks, { type: "text", text: PARSER_PROMPT }] }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The parser declined these images. Try clearer screenshots or enter the trends manually.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Too many trends for one pass — upload fewer screenshots at a time.");
  }
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The parser returned an unreadable result — try again or enter the trends manually.");
  }
  const result = z.object({ trends: z.array(trendInputSchema.omit({ source: true, gameDate: true })) }).parse(parsed);
  return result.trends.map((t) => ({ ...t, source: "upload" as const, signals: t.signals ?? [] }));
}
