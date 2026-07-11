import { z } from "zod";

export const createQueueSchema = z.object({
  name: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(100).default(0),
  maxConcurrency: z.number().int().min(1).max(1000).default(5),
  defaultRetryPolicyId: z.string().uuid().optional(),
});
export type CreateQueueInput = z.infer<typeof createQueueSchema>;

export const updateQueueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  maxConcurrency: z.number().int().min(1).max(1000).optional(),
  isPaused: z.boolean().optional(),
  defaultRetryPolicyId: z.string().uuid().nullable().optional(),
});
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;

export const listQueuesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  isPaused: z.coerce.boolean().optional(),
});
export type ListQueuesQuery = z.infer<typeof listQueuesQuerySchema>;

export const queueIdParamsSchema = z.object({
  queueId: z.string().uuid(),
});
