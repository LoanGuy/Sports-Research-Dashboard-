/**
 * Error monitoring (Sentry). Enabled only when SENTRY_DSN is set; the app
 * runs normally without it.
 */
import * as Sentry from "@sentry/node";

export function initMonitoring(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
  return true;
}

export function captureError(error: unknown): void {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
}
