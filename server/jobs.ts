/**
 * Scheduled jobs scaffold.
 *
 * Data-collection jobs from later phases register here. The runner is a
 * simple in-process interval scheduler — adequate for a single-user tool on
 * a single instance; a dedicated worker or platform cron can replace it
 * without changing job definitions. Enabled with JOBS_ENABLED=1.
 */
import { captureError } from "./monitoring";

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

const jobs: Job[] = [
  {
    // Placeholder proving the runner works; replaced by real data-collection
    // jobs (odds polling, lineup checks, weather refresh) in later phases.
    name: "heartbeat",
    intervalMs: 5 * 60 * 1000,
    run: async () => {
      console.log(`[jobs] heartbeat ok at ${new Date().toISOString()}`);
    },
  },
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
