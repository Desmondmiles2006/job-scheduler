export type SimpleScheduleUnit = "minutes" | "hours" | "days";

function intervalField(interval: number): string {
  return interval === 1 ? "*" : `*/${interval}`;
}

/**
 * Converts a "every N minutes|hours|days" simple schedule into a 5-field
 * cron expression. N=1 collapses to a bare wildcard for that field so the
 * output reads like a normal cron expression (e.g. daily is "0 0 * * *"
 * rather than an every-1-day interval form).
 */
export function simpleScheduleToCron(interval: number, unit: SimpleScheduleUnit): string {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("Interval must be a positive integer");
  }

  switch (unit) {
    case "minutes":
      return `${intervalField(interval)} * * * *`;
    case "hours":
      return `0 ${intervalField(interval)} * * *`;
    case "days":
      return `0 0 ${intervalField(interval)} * *`;
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unknown unit: ${exhaustive}`);
    }
  }
}
