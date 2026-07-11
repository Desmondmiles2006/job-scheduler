import { z } from "zod";

export const createJobSchema = z.object({
  type: z.string().min(1).max(200),
  payload: z.record(z.unknown()).default({}),
  runAt: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(50).optional(),
  retryPolicyId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  priority: z.number().int().min(0).max(100).default(0),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const batchCreateJobsSchema = z.object({
  jobs: z.array(createJobSchema).min(1).max(500),
});
export type BatchCreateJobsInput = z.infer<typeof batchCreateJobsSchema>;

export const listJobsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum(["SCHEDULED", "QUEUED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "DEAD_LETTER", "CANCELLED"])
    .optional(),
  type: z.string().optional(),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const jobIdParamsSchema = z.object({
  projectId: z.string().uuid(),
  queueId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const executionLogsParamsSchema = jobIdParamsSchema.extend({
  executionId: z.string().uuid(),
});

export const queueScopedParamsSchema = z.object({
  projectId: z.string().uuid(),
  queueId: z.string().uuid(),
});
