import type { Express } from "express";
import type { Server } from "http";
import { requireAuth, setupAuth } from "./auth";
import { isDbConfigured } from "./db";

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
}
