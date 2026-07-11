import { computeRetryDelayMs, RetryPolicyConfig } from "../lib/retryPolicy";

describe("computeRetryDelayMs", () => {
  const noJitter = (v: number) => v;

  it("fixed strategy always returns baseDelayMs", () => {
    const policy: RetryPolicyConfig = {
      strategy: "FIXED",
      baseDelayMs: 5000,
      maxDelayMs: 60000,
      multiplier: 2,
    };
    expect(computeRetryDelayMs(policy, 1, noJitter)).toBe(5000);
    expect(computeRetryDelayMs(policy, 5, noJitter)).toBe(5000);
  });

  it("linear strategy scales with attempt number", () => {
    const policy: RetryPolicyConfig = {
      strategy: "LINEAR",
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
    };
    expect(computeRetryDelayMs(policy, 1, noJitter)).toBe(1000);
    expect(computeRetryDelayMs(policy, 3, noJitter)).toBe(3000);
  });

  it("exponential strategy compounds by multiplier^(attempt-1)", () => {
    const policy: RetryPolicyConfig = {
      strategy: "EXPONENTIAL",
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
    };
    expect(computeRetryDelayMs(policy, 1, noJitter)).toBe(1000);
    expect(computeRetryDelayMs(policy, 2, noJitter)).toBe(2000);
    expect(computeRetryDelayMs(policy, 3, noJitter)).toBe(4000);
    expect(computeRetryDelayMs(policy, 4, noJitter)).toBe(8000);
  });

  it("caps every strategy at maxDelayMs", () => {
    const policy: RetryPolicyConfig = {
      strategy: "EXPONENTIAL",
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      multiplier: 3,
    };
    expect(computeRetryDelayMs(policy, 10, noJitter)).toBe(5000);
  });

  it("default jitter stays within +/-20% of the unjittered value", () => {
    const policy: RetryPolicyConfig = {
      strategy: "EXPONENTIAL",
      baseDelayMs: 1000,
      maxDelayMs: 100000,
      multiplier: 2,
    };
    for (let i = 0; i < 50; i++) {
      const delay = computeRetryDelayMs(policy, 3); // attempt 3 -> unjittered 4000
      expect(delay).toBeGreaterThanOrEqual(4000 * 0.8);
      expect(delay).toBeLessThanOrEqual(4000 * 1.2);
    }
  });
});
