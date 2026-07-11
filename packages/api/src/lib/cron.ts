import { Cron } from "croner";

export function computeNextRun(cronExpression: string, timezone: string, after: Date = new Date()): Date {
  const job = new Cron(cronExpression, { paused: true, timezone });
  const next = job.nextRun(after);
  if (!next) {
    throw new Error(`Cron expression "${cronExpression}" has no future occurrences`);
  }
  return next;
}
