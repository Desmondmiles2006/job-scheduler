import { Cron } from "croner";

/**
 * Pure function: given a cron expression and a reference time, returns the
 * next time it should fire. This is the ONLY thing the cron library is used
 * for - it never runs a job itself. The scheduler writes next_run_at to
 * Postgres and a later tick is what actually enqueues the job.
 */
export function computeNextRun(cronExpression: string, timezone: string, after: Date): Date {
  const job = new Cron(cronExpression, { paused: true, timezone });
  const next = job.nextRun(after);
  if (!next) {
    throw new Error(`Cron expression "${cronExpression}" has no future occurrences`);
  }
  return next;
}
