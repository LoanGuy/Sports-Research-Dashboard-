import type { Express } from "express";
import type { Server } from "http";

/**
 * API routes. Phase 1 serves the clickable mockup, so the only endpoint is a
 * health check — sample data lives client-side in client/src/data/. Later
 * phases add the data-collection, consensus, and grading endpoints here.
 */
export function registerRoutes(_server: Server, app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
}
