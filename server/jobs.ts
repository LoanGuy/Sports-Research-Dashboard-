/**
 * Scheduled jobs scaffold.
 *
 * Data-collection jobs from later phases register here. The runner is a
 * simple in-process interval scheduler — adequate for a single-user tool on
 * a single instance; a dedicated worker or platform cron can replace it
 * without changing job definitions. Enabled with JOBS_ENABLED=1.
 */
import { captureError } from "./monitoring";
import { collectionConfigured, runCollection } from "./collect";

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

/**
 * MLB odds collection cadence. Opt-in via COLLECT_INTERVAL_MIN (minimum 10
 * minutes — provider odds are ~10 min delayed anyway, and each run costs
 * one metered API request). Without it, collection is manual via
 * GET /api/collect/run.
 */
function collectionJobs(): Job[] {
  const raw = Number(process.env.COLLECT_INTERVAL_MIN ?? 0);
  if (!raw || Number.isNaN(raw)) return [];
  if (!collectionConfigured().ok) {
    console.log("[jobs] COLLECT_INTERVAL_MIN set but collection is not configured — skipping");
    return [];
  }
  const minutes = Math.max(10, Math.floor(raw));
  return [
    {
      name: "mlb-odds-collection",
      intervalMs: minutes * 60 * 1000,
      run: async () => {
        const summary = await runCollection();
        console.log(`[jobs] mlb-odds-collection: ${summary.message}`);
      },
    },
  ];
}

const jobs: Job[] = [
  {
    name: "heartbeat",
    intervalMs: 5 * 60 * 1000,
    run: async () => {
      console.log(`[jobs] heartbeat ok at ${new Date().toISOString()}`);
    },
  },
  ...collectionJobs(),
];

const timers: NodeJS.Timeout[] = [];

export function startJobs(): void {
  if (process.env.JOBS_ENABLED !== "1") {
    console.log("[jobs] disabled (set JOBS_ENABLED=1 to enable)");
    return;
  }
  for (const job of jobs) {
    const timer = setInterval(() => {
      job.run().catch((error) => {
        console.error(`[jobs] ${job.name} failed:`, error);
        captureError(error);
      });
    }, job.intervalMs);
    timer.unref();
    timers.push(timer);
    console.log(`[jobs] scheduled ${job.name} every ${job.intervalMs / 1000}s`);
  }
}

export function stopJobs(): void {
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
}
