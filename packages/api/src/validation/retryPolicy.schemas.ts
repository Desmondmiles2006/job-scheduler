import { z } from "zod";

export const createRetryPolicySchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z.enum(["FIXED", "LINEAR", "EXPONENTIAL"]),
  baseDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(50),
  multiplier: z.number().min(1).max(10).default(2),
});
export type CreateRetryPolicyInput = z.infer<typeof createRetryPolicySchema>;

export const retryPolicyIdParamsSchema = z.object({
  retryPolicyId: z.string().uuid(),
});
