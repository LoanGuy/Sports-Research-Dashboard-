import type { Express } from "express";
import type { Server } from "http";
import { requireAuth, setupAuth } from "./auth";
import { isDbConfigured } from "./db";
import { runSportsGameOddsCheck } from "./providers/sportsgameodds";
import { collectionConfigured, previewRaw, runCollection } from "./collect";
import { getConsensusFeed, getLiveFeed } from "./opportunities";
import { betInputSchema, createBet, deleteBet, listBets, seedInitialBets, seedPrizePicks, seedPrizePicks2025, updateBet } from "./bets";

export function registerRoutes(_server: Server, app: Express) {
  setupAuth(app);
  app.use(requireAuth);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: isDbConfigured() ? "configured" : "not configured",
      collection: collectionConfigured().ok ? "configured" : "not configured",
    });
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
}
