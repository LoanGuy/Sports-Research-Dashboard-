/**
 * Single-user authentication.
 *
 * The dashboard is private, so auth is a single password set via the
 * DASHBOARD_PASSWORD environment variable. When it is unset (local dev,
 * mockup mode) auth is disabled and the API is open. Sessions persist in
 * PostgreSQL when DATABASE_URL is set, otherwise in memory.
 *
 * This deliberately avoids an external auth provider for now; the login
 * surface is one endpoint, so swapping in Supabase Auth/Clerk/Auth.js later
 * only replaces this module.
 */
import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { getPool, isDbConfigured } from "./db";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
  }
}

export function isAuthRequired(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

function timingSafeEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a).digest();
  const digestB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function setupAuth(app: Express): void {
  const secret = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex");
  if (!process.env.SESSION_SECRET && isAuthRequired()) {
    console.warn(
      "[auth] SESSION_SECRET is not set — sessions will not survive a restart. Set it in production.",
    );
  }

  let store: session.Store;
  if (isDbConfigured()) {
    const PgStore = connectPgSimple(session);
    store = new PgStore({ pool: getPool()!, createTableIfMissing: true });
  } else {
    const MemoryStore = createMemoryStore(session);
    store = new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 });
  }

  app.set("trust proxy", 1);
  // Auth responses must never be cached — a cached "authenticated: false"
  // would strand the user on the login screen after a successful login.
  app.set("etag", false);
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    session({
      secret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        // "auto": secure over HTTPS (incl. behind a trusted proxy), plain
        // over local HTTP. A hard `true` would silently drop the cookie in
        // any non-TLS context.
        secure: "auto",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    }),
  );

  app.get("/api/auth/status", (req, res) => {
    res.json({
      authRequired: isAuthRequired(),
      authenticated: !isAuthRequired() || req.session.authenticated === true,
    });
  });

  app.post("/api/auth/login", (req, res) => {
    if (!isAuthRequired()) {
      return res.json({ success: true });
    }
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !timingSafeEqual(password, process.env.DASHBOARD_PASSWORD!)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    req.session.authenticated = true;
    return res.json({ success: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });
}

/** Protects /api/* except health and auth endpoints. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) return next();
  if (req.path === "/api/health" || req.path.startsWith("/api/auth/")) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (req.session?.authenticated === true) return next();
  res.status(401).json({ error: "Authentication required" });
}
