export type RetryStrategy = "FIXED" | "LINEAR" | "EXPONENTIAL";

export interface RetryPolicyConfig {
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

/**
 * Computes the delay (ms) to wait before the given attempt number is retried.
 * attemptNumber is 1-indexed: the delay returned is applied *after* that
 * attempt has failed, before the next attempt runs.
 *
 * Exponential backoff includes +/-20% jitter to avoid a thundering herd of
 * retries all landing on the same tick when many jobs fail together.
 */
export function computeRetryDelayMs(
  policy: RetryPolicyConfig,
  attemptNumber: number,
  jitter: (spreadFactor: number) => number = defaultJitter
): number {
  let delay: number;

  switch (policy.strategy) {
    case "FIXED":
      delay = policy.baseDelayMs;
      break;
    case "LINEAR":
      delay = policy.baseDelayMs * attemptNumber;
      break;
    case "EXPONENTIAL":
      delay = policy.baseDelayMs * Math.pow(policy.multiplier, attemptNumber - 1);
      delay = jitter(delay);
      break;
    default: {
      const exhaustive: never = policy.strategy;
      throw new Error(`Unknown retry strategy: ${exhaustive}`);
    }
  }

  return Math.min(Math.round(delay), policy.maxDelayMs);
}

function defaultJitter(value: number): number {
  const spread = value * 0.2;
  return value - spread + Math.random() * (2 * spread);
}

export function computeNextRunAt(
  policy: RetryPolicyConfig,
  attemptNumber: number,
  now: Date = new Date()
): Date {
  const delayMs = computeRetryDelayMs(policy, attemptNumber);
  return new Date(now.getTime() + delayMs);
}
