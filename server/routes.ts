import type { Express } from "express";
import type { Server } from "http";
import { requireAuth, setupAuth } from "./auth";
import { isDbConfigured } from "./db";
import { runSportsGameOddsCheck } from "./providers/sportsgameodds";
import { collectionConfigured, previewRaw, runCollection } from "./collect";
import { getLiveFeed } from "./opportunities";

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

  /** One-time provider verification battery (kept for future re-checks). */
  app.get("/api/provider-check/sportsgameodds", async (_req, res) => {
    try {
      res.json(await runSportsGameOddsCheck());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
}
