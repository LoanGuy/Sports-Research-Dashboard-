import type { Express } from "express";
import type { Server } from "http";
import { requireAuth, setupAuth } from "./auth";
import { isDbConfigured } from "./db";
import { runSportsGameOddsCheck } from "./providers/sportsgameodds";

/**
 * API routes. Phase 1 serves the clickable mockup (sample data lives
 * client-side in client/src/data/); Phase 2 adds auth, sessions, and the
 * database wiring below. Data-collection endpoints arrive with the provider
 * integration phase.
 */
export function registerRoutes(_server: Server, app: Express) {
  setupAuth(app);
  app.use(requireAuth);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: isDbConfigured() ? "configured" : "not configured",
    });
  });

  // One-time provider verification battery (login required). Open in the
  // browser while logged in; the JSON report documents what the API plan
  // actually covers. Rate-limit friendly: at most 7 provider requests.
  app.get("/api/provider-check/sportsgameodds", async (_req, res) => {
    try {
      res.json(await runSportsGameOddsCheck());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });
}
