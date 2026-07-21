import type { Express } from "express";
import type { Server } from "http";
import { requireAuth, setupAuth } from "./auth";
import { isDbConfigured } from "./db";
import { runSportsGameOddsCheck } from "./providers/sportsgameodds";
import { runOddsApiCheck } from "./providers/theoddsapi";
import { collectionConfigured, previewRaw, runCollection } from "./collect";
import { getConsensusFeed, getLiveFeed } from "./opportunities";
import { betInputSchema, createBet, deleteBet, listBets, seedInitialBets, seedPrizePicks, seedPrizePicks2025, updateBet } from "./bets";
import { anthropicConfigured, createTrends, deleteTrend, listTrends, parseTrendImages, todayEt, trendInputSchema } from "./trends";
import { normalizePlayerKey } from "./markets";
import { z } from "zod";

export function registerRoutes(_server: Server, app: Express) {
  setupAuth(app);
  app.use(requireAuth);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: isDbConfigured() ? "configured" : "not configured",
      collection: collectionConfigured().ok ? "configured" : "not configured",
      // Presence booleans only — values are never exposed.
      envSeenByApp: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        SPORTSGAMEODDS_API_KEY: Boolean(process.env.SPORTSGAMEODDS_API_KEY),
        THEODDSAPI_KEY: Boolean(
          process.env.THEODDSAPI_KEY || process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || process.env.THEODDS_API_KEY,
        ),
        SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
        DASHBOARD_PASSWORD: Boolean(process.env.DASHBOARD_PASSWORD),
        ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    });
  });

  // ---- Trend research (screenshot uploads + manual entry) ----

  /** Today's saved trends (or ?date=YYYY-MM-DD). */
  app.get("/api/trends", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : todayEt();
      res.json({ date, trends: await listTrends(date) });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Save reviewed trends. Body: { trends: TrendInput[] }. */
  app.post("/api/trends", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      const parsed = z.object({ trends: z.array(trendInputSchema).min(1) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      res.status(201).json({ saved: await createTrends(parsed.data.trends, normalizePlayerKey) });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/trends/:id", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      await deleteTrend(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * Parse trend screenshots with Claude vision. Body:
   * { images: [{ mediaType, data (base64) }] }. Returns extracted trends
   * for the user to review before saving — nothing is stored here.
   */
  app.post("/api/trends/parse", async (req, res) => {
    try {
      if (!anthropicConfigured()) {
        return res.status(503).json({
          error: "ANTHROPIC_API_KEY is not set. Add it in Railway variables to enable screenshot parsing — manual entry still works.",
        });
      }
      const parsed = z
        .object({
          images: z
            .array(z.object({ mediaType: z.string().min(1), data: z.string().min(1) }))
            .min(1)
            .max(8),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      res.json({ trends: await parseTrendImages(parsed.data.images) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Live research feed built from the newest collected batch. */
  app.get("/api/opportunities", async (_req, res) => {
    try {
      res.json(await getLiveFeed());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * Trigger one collection run (one provider API request). GET so it can be
   * triggered from a logged-in browser tab; the auth middleware protects it.
   */
  app.get("/api/collect/run", async (_req, res) => {
    try {
      res.json(await runCollection());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Raw provider sample for parser debugging (one provider API request). */
  app.get("/api/collect/preview", async (_req, res) => {
    try {
      res.json(await previewRaw());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** All consensus markets from the newest batch (powers the price check). */
  app.get("/api/consensus", async (_req, res) => {
    try {
      res.json(await getConsensusFeed());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ---- Bet journal ----
  app.get("/api/bets", async (_req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      res.json(await listBets());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/bets", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      const parsed = betInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      res.status(201).json(await createBet(parsed.data));
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.patch("/api/bets/:id", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      const parsed = betInputSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const updated = await updateBet(Number(req.params.id), parsed.data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete("/api/bets/:id", async (req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      await deleteBet(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Idempotent: loads the 15 chat-analyzed tickets when the journal is empty. */
  app.get("/api/bets/seed-initial", async (_req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      res.json(await seedInitialBets());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Idempotent: loads the PrizePicks history when none is present. */
  app.get("/api/bets/seed-prizepicks", async (_req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      res.json(await seedPrizePicks());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Idempotent: loads the Feb-Mar 2025 PrizePicks era. */
  app.get("/api/bets/seed-prizepicks-2025", async (_req, res) => {
    try {
      if (!isDbConfigured()) return res.status(503).json({ error: "Database not configured" });
      res.json(await seedPrizePicks2025());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** One-time provider verification battery (kept for future re-checks). */
  app.get("/api/provider-check/sportsgameodds", async (_req, res) => {
    try {
      res.json(await runSportsGameOddsCheck());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** The Odds API battery — Hard Rock Bet is the headline check (~10 credits). */
  app.get("/api/provider-check/theoddsapi", async (_req, res) => {
    try {
      res.json(await runOddsApiCheck());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
}
